// Valkey-backed sliding-window rate limits (docs/architecture.md §5.9).
//
// Every class from the §5.9 table is encoded here and enforced at the BFF
// choke point (src/routes/api/ehrbase/$.ts) plus the sensitive routes
// (break-glass, audit export, csp-report). Keys are the session id for authed
// classes or the source IP for anonymous ones. Sub-millisecond Valkey latency
// means we shield EHRbase from the load entirely rather than relying on its
// own throttling.

import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible'

import { valkey } from '@/lib/valkey.server'

export type RateLimitClass =
  | 'aql'
  | 'aql-complex'
  | 'composition-write'
  | 'read'
  | 'audit-export'
  | 'emergency-access'
  | 'csp-report'

const SESSION_LIFETIME_SECONDS = Number(
  process.env.SESSION_ABSOLUTE_TIMEOUT_SECONDS ?? 43200,
)

// points = allowed events, duration = window in seconds.
const config: Record<RateLimitClass, { points: number; duration: number }> = {
  aql: { points: 60, duration: 60 },
  'aql-complex': { points: 10, duration: 60 },
  'composition-write': { points: 120, duration: 60 },
  read: { points: 600, duration: 60 },
  'audit-export': { points: 1, duration: 60 * 60 },
  // "3 per session, lifetime" — the window is the session's absolute lifetime.
  'emergency-access': { points: 3, duration: SESSION_LIFETIME_SECONDS },
  'csp-report': { points: 30, duration: 60 },
}

const limiters = new Map<RateLimitClass, RateLimiterRedis>()
function limiterFor(cls: RateLimitClass): RateLimiterRedis {
  const existing = limiters.get(cls)
  if (existing) return existing
  const created = new RateLimiterRedis({
    storeClient: valkey,
    keyPrefix: `rl:${cls}`,
    points: config[cls].points,
    duration: config[cls].duration,
  })
  limiters.set(cls, created)
  return created
}

export type RateLimitResult = {
  allowed: boolean
  limit: number
  remaining: number
  retryAfterSeconds: number
}

export async function checkRateLimit(
  cls: RateLimitClass,
  key: string,
): Promise<RateLimitResult> {
  const limiter = limiterFor(cls)
  try {
    const res = await limiter.consume(key, 1)
    return {
      allowed: true,
      limit: config[cls].points,
      remaining: res.remainingPoints,
      retryAfterSeconds: 0,
    }
  } catch (err) {
    if (err instanceof RateLimiterRes) {
      return {
        allowed: false,
        limit: config[cls].points,
        remaining: 0,
        retryAfterSeconds: Math.ceil(err.msBeforeNext / 1000),
      }
    }
    // A real Valkey error — fail closed for sensitive classes is safer, but a
    // store outage should not silently drop reads. Surface it.
    throw err
  }
}

// 429 response with the advisory headers the §5.9 table calls for.
export function tooManyRequests(result: RateLimitResult): Response {
  return new Response(JSON.stringify({ code: 'RATE_LIMITED' }), {
    status: 429,
    headers: {
      'content-type': 'application/json',
      'retry-after': String(result.retryAfterSeconds),
      'x-ratelimit-limit': String(result.limit),
      'x-ratelimit-remaining': String(result.remaining),
    },
  })
}
