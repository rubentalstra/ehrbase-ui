// Care-relationship gate + break-glass purpose resolution tests (ADR-0045).
// hasActiveBreakGlass + auditAccess are mocked.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/server/auth/break-glass.ts', () => ({ hasActiveBreakGlass: vi.fn() }))
vi.mock('@/server/audit', () => ({ auditAccess: vi.fn().mockResolvedValue(undefined) }))

import { hasActiveBreakGlass } from '@/server/auth/break-glass.ts'
import { auditAccess } from '@/server/audit'

import type { EhrbaseContext } from '../ehrbase-context.server.ts'
import {
  careRelationshipGate,
  resolveAccessPurpose,
  setCareRelationshipProvider,
} from '../ehr-access.server.ts'

const EHR = '6220add0-eced-4f9b-9610-4a5d84bf4cae'
const ctx: EhrbaseContext = {
  user: { id: 'u1', email: 'doc@example.test', name: 'Doc', roles: ['clinician'] },
  accessToken: 't',
  baseUrl: 'http://ehrbase/x',
  sid: 'sess-1',
}

beforeEach(() => {
  vi.clearAllMocks()
  // Reset to the default permissive provider between tests.
  setCareRelationshipProvider({ isInCareTeam: () => Promise.resolve(true) })
})

describe('careRelationshipGate', () => {
  it('allows access when the actor is in the care team', async () => {
    vi.mocked(hasActiveBreakGlass).mockResolvedValue(false)
    await expect(careRelationshipGate(ctx, EHR)).resolves.toBeUndefined()
    expect(auditAccess).not.toHaveBeenCalled()
  })

  it('denies (403 + break-glass:available) + audits ACCESS_DENIED when not in care and no grant', async () => {
    setCareRelationshipProvider({ isInCareTeam: () => Promise.resolve(false) })
    vi.mocked(hasActiveBreakGlass).mockResolvedValue(false)

    await expect(careRelationshipGate(ctx, EHR)).rejects.toMatchObject({ status: 403 })
    try {
      await careRelationshipGate(ctx, EHR)
    } catch (e) {
      expect(e).toBeInstanceOf(Response)
      if (e instanceof Response) expect(e.headers.get('break-glass')).toBe('available')
    }
    const denied = vi
      .mocked(auditAccess)
      .mock.calls.some((c) => c[0]?.action === 'ACCESS_DENIED' && c[0]?.outcome === 'FAILURE')
    expect(denied).toBe(true)
  })

  it('allows access under an active break-glass grant even when not in care', async () => {
    setCareRelationshipProvider({ isInCareTeam: () => Promise.resolve(false) })
    vi.mocked(hasActiveBreakGlass).mockResolvedValue(true)
    await expect(careRelationshipGate(ctx, EHR)).resolves.toBeUndefined()
  })
})

describe('resolveAccessPurpose', () => {
  it('is BTG under an active grant, TREAT otherwise', async () => {
    vi.mocked(hasActiveBreakGlass).mockResolvedValue(true)
    expect(await resolveAccessPurpose('u1', EHR)).toBe('BTG')
    vi.mocked(hasActiveBreakGlass).mockResolvedValue(false)
    expect(await resolveAccessPurpose('u1', EHR)).toBe('TREAT')
  })
})
