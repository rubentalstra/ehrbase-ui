// Readiness aggregator unit tests (docs/architecture.md §13.4).
//
// Each subsystem probe is mocked at the dependency level so the tests run
// in <50ms without docker compose up. We exercise the aggregator's status
// + per-check fields + 503 fallback and verify (per CLAUDE.md Inviolable
// rule 2) that no underlying error text leaks into the response body —
// only the documented `'ok' | 'fail'` per-subsystem outcome.

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@ehrbase-ui/valkey', () => ({
  valkey: { ping: vi.fn() },
}))

vi.mock('@ehrbase-ui/db-platform/client', () => ({
  auditDb: { execute: vi.fn() },
  getAuditRetentionDb: vi.fn(),
}))

vi.mock('@ehrbase-ui/db-platform/auth-client', () => ({
  authDb: { execute: vi.fn() },
}))

const fetchMock = vi.fn<typeof fetch>()
globalThis.fetch = fetchMock

import { valkey } from '@ehrbase-ui/valkey'
import { auditDb } from '@ehrbase-ui/db-platform/client'
import { authDb } from '@ehrbase-ui/db-platform/auth-client'
import { checkReadiness } from '../health/checks.ts'

const originalEnv = { ...process.env }

afterEach(() => {
  vi.resetAllMocks()
  process.env = { ...originalEnv }
})

// Namespace-level mock proxies — accessing `.ping` / `.execute` through the
// mocked() proxy is a field read, not a method reference, so the
// no-unbound-method rule doesn't fire (it would fire on
// `vi.mocked(valkey.ping)` because that pulls the method off the instance).
const valkeyMock = vi.mocked(valkey)
const auditDbMock = vi.mocked(auditDb)
const authDbMock = vi.mocked(authDb)

function setUpHappyPath() {
  process.env.EHRBASE_URL = 'http://ehrbase:8080/ehrbase/rest/openehr/v1'
  process.env.KEYCLOAK_INTERNAL_ISSUER_URL =
    'http://keycloak:8080/realms/ehrbase'
  valkeyMock.ping.mockResolvedValue('PONG')
  auditDbMock.execute.mockResolvedValue(undefined)
  authDbMock.execute.mockResolvedValue(undefined)
  fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
}

async function readBody(res: Response): Promise<{
  status: string
  checks: Record<string, string>
}> {
  const raw = await res.text()
  const parsed: unknown = JSON.parse(raw)
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('status' in parsed) ||
    !('checks' in parsed)
  ) {
    throw new Error('unexpected response body shape')
  }
  const obj = parsed
  if (typeof obj.status !== 'string' || typeof obj.checks !== 'object') {
    throw new Error('unexpected response body shape')
  }
  return { status: obj.status, checks: obj.checks as Record<string, string> }
}

describe('checkReadiness — §13.4 readiness aggregator', () => {
  it('returns 200 + status=ready when every probe passes', async () => {
    setUpHappyPath()
    const res = await checkReadiness()
    expect(res.status).toBe(200)
    const body = await readBody(res)
    expect(body.status).toBe('ready')
    expect(body.checks).toEqual({
      valkey: 'ok',
      ehrbase: 'ok',
      keycloak: 'ok',
      audit_db: 'ok',
      auth_db: 'ok',
    })
  })

  it('returns 503 + status=not_ready when Valkey is down', async () => {
    setUpHappyPath()
    valkeyMock.ping.mockRejectedValueOnce(
      new Error('CONN refused — fake error with PHI: BSN=123'),
    )
    const res = await checkReadiness()
    expect(res.status).toBe(503)
    const body = await readBody(res)
    expect(body.status).toBe('not_ready')
    expect(body.checks.valkey).toBe('fail')
    expect(body.checks.ehrbase).toBe('ok')
    // CLAUDE.md Inviolable rule 2 — the error text MUST NOT leak.
    const raw = JSON.stringify(body)
    expect(raw).not.toContain('CONN refused')
    expect(raw).not.toContain('BSN=123')
  })

  it('returns 503 when audit DB fails', async () => {
    setUpHappyPath()
    auditDbMock.execute.mockRejectedValueOnce(
      new Error(
        'connection refused to platform-db:5432/audit (password=plaintext-leak)',
      ),
    )
    const res = await checkReadiness()
    expect(res.status).toBe(503)
    const body = await readBody(res)
    expect(body.checks.audit_db).toBe('fail')
    expect(body.checks.auth_db).toBe('ok')
    const raw = JSON.stringify(body)
    expect(raw).not.toContain('plaintext-leak')
    expect(raw).not.toContain('platform-db')
  })

  it('returns 503 when EHRbase HTTP probe returns non-2xx', async () => {
    setUpHappyPath()
    // Discriminate by host — the Keycloak URL contains "ehrbase" in its
    // realm path (`.../realms/ehrbase/...`) so we can't substring-match
    // the package name. Match the hostname instead.
    fetchMock.mockImplementation((url) => {
      const href = typeof url === 'string' ? url : url instanceof URL ? url.href : ''
      if (href.includes('//ehrbase:')) {
        return Promise.resolve(new Response(null, { status: 503 }))
      }
      return Promise.resolve(new Response(null, { status: 200 }))
    })
    const res = await checkReadiness()
    expect(res.status).toBe(503)
    const body = await readBody(res)
    expect(body.checks.ehrbase).toBe('fail')
    expect(body.checks.keycloak).toBe('ok')
  })

  it('returns 503 when Keycloak discovery URL is unreachable', async () => {
    setUpHappyPath()
    fetchMock.mockImplementation((url) => {
      const href = typeof url === 'string' ? url : url instanceof URL ? url.href : ''
      if (href.includes('//keycloak:')) {
        return Promise.reject(
          new Error('ECONNREFUSED — secret=should-not-appear'),
        )
      }
      return Promise.resolve(new Response(null, { status: 200 }))
    })
    const res = await checkReadiness()
    expect(res.status).toBe(503)
    const body = await readBody(res)
    expect(body.checks.keycloak).toBe('fail')
    const raw = JSON.stringify(body)
    expect(raw).not.toContain('should-not-appear')
    expect(raw).not.toContain('ECONNREFUSED')
  })

  it('sets cache-control: no-store on the response', async () => {
    setUpHappyPath()
    const res = await checkReadiness()
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('content-type')).toBe('application/json')
  })
})
