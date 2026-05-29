import { describe, expect, it, vi } from 'vitest'

vi.mock('@ehrbase-ui/valkey', () => {
  const store = new Map<string, string>()
  return {
    valkey: {
      set: vi.fn((k: string, v: string) => {
        store.set(k, v)
        return Promise.resolve('OK')
      }),
      del: vi.fn((k: string) => {
        const had = store.has(k)
        store.delete(k)
        return Promise.resolve(had ? 1 : 0)
      }),
    },
  }
})

import { consumeCsrfToken, isAllowedOrigin, issueCsrfToken } from '../csrf.server.ts'

// Tests run with KEYCLOAK_REDIRECT_URI = http://localhost:3000/... so the
// allow-listed origin is http://localhost:3000.
describe('isAllowedOrigin', () => {
  it('accepts the configured origin', () => {
    const req = new Request('http://localhost:3000/api/auth/break-glass', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000' },
    })
    expect(isAllowedOrigin(req)).toBe(true)
  })

  it('rejects a foreign origin', () => {
    const req = new Request('http://localhost:3000/api/auth/break-glass', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
    })
    expect(isAllowedOrigin(req)).toBe(false)
  })

  it('rejects a request with no Origin or Referer', () => {
    const req = new Request('http://localhost:3000/api/auth/break-glass', { method: 'POST' })
    expect(isAllowedOrigin(req)).toBe(false)
  })

  it('falls back to a matching Referer', () => {
    const req = new Request('http://localhost:3000/api/auth/break-glass', {
      method: 'POST',
      headers: { referer: 'http://localhost:3000/_authed/me' },
    })
    expect(isAllowedOrigin(req)).toBe(true)
  })
})

describe('CSRF tokens', () => {
  it('are single-use', async () => {
    const token = await issueCsrfToken('sess-1')
    expect(await consumeCsrfToken('sess-1', token)).toBe(true)
    expect(await consumeCsrfToken('sess-1', token)).toBe(false)
  })

  it('are session-bound', async () => {
    const token = await issueCsrfToken('sess-A')
    expect(await consumeCsrfToken('sess-B', token)).toBe(false)
  })
})
