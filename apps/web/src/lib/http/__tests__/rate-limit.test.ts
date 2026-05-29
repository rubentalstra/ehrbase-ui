import { beforeEach, describe, expect, it, vi } from 'vitest'

// In-memory stand-in for RateLimiterRedis so the §5.9 window logic is testable
// without Valkey. instanceof RateLimiterRes still works because our code
// imports the same class exported here.
vi.mock('rate-limiter-flexible', () => {
  class RateLimiterRes {
    msBeforeNext = 1000
    remainingPoints = 0
  }
  class RateLimiterRedis {
    points: number
    counts = new Map<string, number>()
    constructor(opts: { points: number }) {
      this.points = opts.points
    }
    consume(key: string) {
      const next = (this.counts.get(key) ?? 0) + 1
      this.counts.set(key, next)
      if (next > this.points) {
        const res = new RateLimiterRes()
        return Promise.reject(res)
      }
      const ok = new RateLimiterRes()
      ok.remainingPoints = this.points - next
      return Promise.resolve(ok)
    }
  }
  return { RateLimiterRedis, RateLimiterRes }
})

import { checkRateLimit } from '@/lib/http/rate-limit.server'

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('allows up to the emergency-access ceiling then blocks the 4th', async () => {
    const key = `sess-${Math.random()}`
    expect((await checkRateLimit('emergency-access', key)).allowed).toBe(true)
    expect((await checkRateLimit('emergency-access', key)).allowed).toBe(true)
    expect((await checkRateLimit('emergency-access', key)).allowed).toBe(true)
    const fourth = await checkRateLimit('emergency-access', key)
    expect(fourth.allowed).toBe(false)
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('keys are independent across sessions', async () => {
    const a = await checkRateLimit('read', `a-${Math.random()}`)
    const b = await checkRateLimit('read', `b-${Math.random()}`)
    expect(a.allowed).toBe(true)
    expect(b.allowed).toBe(true)
  })
})
