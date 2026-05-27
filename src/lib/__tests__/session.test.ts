import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/valkey.server', () => {
  const store = new Map<string, string>()
  return {
    valkey: {
      get: vi.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
      set: vi.fn((k: string, v: string) => {
        store.set(k, v)
        return Promise.resolve('OK')
      }),
      del: vi.fn((k: string) => {
        const had = store.has(k)
        store.delete(k)
        return Promise.resolve(had ? 1 : 0)
      }),
      __store: store,
    },
  }
})

import {
  createSessionId,
  destroySession,
  readSession,
  writeSession,
  type SessionData,
} from '@/lib/session.server'

const authed: SessionData = {
  status: 'authenticated',
  userId: 'u1',
  email: 'dev-clinician@example.test',
  name: 'Dev Clinician',
  roles: ['clinician'],
  accessToken: 'token',
  accessTokenExpiresAt: Date.now() + 60_000,
  createdAt: Date.now(),
  lastSeenAt: Date.now(),
  emergencyAccessCount: 0,
}

describe('session store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a 64-char hex session id', () => {
    expect(createSessionId()).toMatch(/^[0-9a-f]{64}$/)
  })

  it('round-trips a session', async () => {
    const sid = createSessionId()
    await writeSession(sid, authed)
    const read = await readSession(sid)
    expect(read).toEqual(authed)
  })

  it('returns null for an unknown session', async () => {
    expect(await readSession('does-not-exist')).toBeNull()
  })

  it('destroys a session', async () => {
    const sid = createSessionId()
    await writeSession(sid, authed)
    await destroySession(sid)
    expect(await readSession(sid)).toBeNull()
  })

  it('rejects a malformed stored payload', async () => {
    const sid = createSessionId()
    await writeSession(sid, authed)
    const mod = await import('@/lib/valkey.server')
    // Corrupt the stored value.
    await mod.valkey.set(`sess:${sid}`, '{"status":"bogus"}')
    expect(await readSession(sid)).toBeNull()
  })
})
