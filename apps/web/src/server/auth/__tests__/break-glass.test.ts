// Break-glass grant-flow tests (ADR-0045): clinician-gating, the durable
// break_glass_grant insert, the BTG ATNA event, and the per-(user,EHR) Valkey
// elevation. Valkey / audit DB / auditAccess / rate-limit are mocked.

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Single-line, `mock`-prefixed so vitest's hoisting can lift it into the
// auditDb factory below. (Factories that reference module-level consts only
// hoist reliably in this single-line form.)
const mockValuesInsert = vi.fn()

vi.mock('@ehrbase-ui/valkey', () => ({
  valkey: { get: vi.fn(), set: vi.fn() },
}))
vi.mock('@/server/audit', () => ({ auditAccess: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/server/db/audit', () => ({ breakGlassGrant: { _: 'break_glass_grant' } }))
vi.mock('@/server/db/audit-client', () => ({
  auditDb: { insert: vi.fn(() => ({ values: mockValuesInsert })) },
}))
vi.mock('@/server/observability/log', () => ({ appLog: { error: vi.fn() } }))
vi.mock('@/server/bff', () => ({ checkRateLimit: vi.fn() }))
vi.mock('../instance.ts', () => ({
  getAuthInstance: () => ({ api: { revokeUserSessions: vi.fn().mockResolvedValue(undefined) } }),
}))

import { auditAccess } from '@/server/audit'
import { checkRateLimit } from '@/server/bff'
import { valkey } from '@ehrbase-ui/valkey'

import {
  getActiveBreakGlass,
  grantEmergencyAccess,
  hasActiveBreakGlass,
} from '../break-glass.ts'
import type { RoleContext } from '../require-role.ts'

// vi.mocked() of a stubbed method is a known unbound-method false positive.
/* eslint-disable @typescript-eslint/unbound-method */
const mockValkeyGet = vi.mocked(valkey.get)
const mockValkeySet = vi.mocked(valkey.set)
/* eslint-enable @typescript-eslint/unbound-method */

const EHR = '6220add0-eced-4f9b-9610-4a5d84bf4cae'

function ctx(roles: string[]): RoleContext {
  return { sid: 'sess-1', user: { id: 'u1', email: 'doc@example.test', name: 'Doc', roles } }
}

const REQ = { justification: 'patient unconscious in ED, no consent on file yet', ehrId: EHR }

beforeEach(() => {
  vi.clearAllMocks()
  mockValuesInsert.mockResolvedValue(undefined)
  mockValkeySet.mockResolvedValue('OK')
  vi.mocked(checkRateLimit).mockResolvedValue({
    allowed: true,
    limit: 3,
    remaining: 2,
    retryAfterSeconds: 0,
  })
})

describe('grantEmergencyAccess', () => {
  it('denies a non-clinician + audits ACCESS_DENIED (no grant written)', async () => {
    const outcome = await grantEmergencyAccess(ctx(['admin']), REQ)
    expect(outcome.status).toBe('denied')
    expect(mockValuesInsert).not.toHaveBeenCalled()
    const denied = vi
      .mocked(auditAccess)
      .mock.calls.some(
        (c) => c[0]?.action === 'ACCESS_DENIED' && c[0]?.purposeOfUse === 'BTG',
      )
    expect(denied).toBe(true)
  })

  it('grants a clinician: durable BTG grant row + BTG ATNA event + Valkey elevation', async () => {
    const outcome = await grantEmergencyAccess(ctx(['clinician']), REQ)
    expect(outcome).toMatchObject({ status: 'granted' })

    // 1. Durable grant row carries the justification + BTG + the EHR scope.
    expect(mockValuesInsert).toHaveBeenCalledTimes(1)
    const row: unknown = mockValuesInsert.mock.calls[0]?.[0]
    expect(row).toMatchObject({
      ehrId: EHR,
      purposeOfUse: 'BTG',
      justification: REQ.justification,
      actorUserId: 'u1',
    })

    // 2. The ATNA event is EXECUTE/BTG and carries NO justification text (rule 2).
    const grantEvent = vi
      .mocked(auditAccess)
      .mock.calls.map((c) => c[0])
      .find((i) => i?.detail === 'break-glass:granted')
    expect(grantEvent?.action).toBe('EXECUTE')
    expect(grantEvent?.purposeOfUse).toBe('BTG')
    expect(JSON.stringify(grantEvent)).not.toContain(REQ.justification)

    // 3. The elevation is keyed per (user, EHR), not per session.
    const setKey: unknown = mockValkeySet.mock.calls[0]?.[0]
    expect(setKey).toBe(`breakglass:u1:${EHR}`)
  })

  it('forces re-auth when the lifetime ceiling is exceeded', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: false,
      limit: 3,
      remaining: 0,
      retryAfterSeconds: 60,
    })
    const outcome = await grantEmergencyAccess(ctx(['clinician']), REQ)
    expect(outcome.status).toBe('forced_logout')
    expect(mockValuesInsert).not.toHaveBeenCalled()
  })
})

describe('active break-glass lookup', () => {
  it('parses a live elevation', async () => {
    mockValkeyGet.mockResolvedValue(
      JSON.stringify({ grantId: 'g1', grantedAt: 1, expiresAt: 2 }),
    )
    expect(await hasActiveBreakGlass('u1', EHR)).toBe(true)
    expect((await getActiveBreakGlass('u1', EHR))?.grantId).toBe('g1')
  })

  it('returns null when there is no elevation', async () => {
    mockValkeyGet.mockResolvedValue(null)
    expect(await hasActiveBreakGlass('u1', EHR)).toBe(false)
  })
})
