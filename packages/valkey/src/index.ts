// Shared Valkey (Redis-wire-compatible) client (docs/architecture.md §5.3).
//
// One client per process, reused by: the session store (§5.3), the audit
// hash-chain head (§14.5), the rate limiter (§5.9), and the per-form CSRF
// token store (§5.8). ioredis works against Valkey unchanged.

import Redis from 'ioredis'

// Import-safe: must not throw at module load (the dev SSR eagerly evaluates
// every route module, so a throw here would 500 the whole app). The default
// matches .env.example; connection is deferred (lazyConnect) and only fails at
// first use if Valkey is genuinely unreachable. Production always sets the var.
const valkeyUrl = process.env.VALKEY_URL ?? 'redis://localhost:6379'

export const valkey = new Redis(valkeyUrl, {
  // Fail fast rather than queueing commands forever if Valkey is down: a
  // PHI-capable server must not silently buffer auth/audit writes.
  maxRetriesPerRequest: 3,
  // Defer the socket until the first command, so importing this module (e.g.
  // in unit tests) does not open a connection on its own.
  lazyConnect: true,
  ...(process.env.VALKEY_PASSWORD ? { password: process.env.VALKEY_PASSWORD } : {}),
})
