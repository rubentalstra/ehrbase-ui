// Valkey leader-elect lock for Nitro scheduled tasks (ADR-0026).
//
// In multi-instance deployments the same cron expression fires on every
// replica. We serialise execution with a SET NX EX lock: the first replica
// to acquire wins and runs `fn`; the others log and skip. The lock is
// released with a Lua script that deletes the key ONLY if it still holds
// our token, so a long-running job whose lock expired doesn't accidentally
// delete a successor's lock. The Lua compare-and-del pattern is the
// canonical Redis distributed-lock recipe (redis.io/docs/manual/patterns/
// distributed-locks/). We register it through ioredis' `defineCommand` (the
// safe, typed alternative to calling Redis EVAL ad-hoc).
//
// TTL should be longer than the expected job duration (job × 1.5 is the rule
// of thumb) so a normal run never sees its own lock expire mid-flight.

import { randomUUID } from 'node:crypto'

import pino from 'pino'

import { valkey } from '@/lib/valkey.server'

const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { module: 'audit/task-lock' },
})

// Augment the ioredis Redis class with the custom command we register below
// — keeps the call-site `valkey.releaseAuditLock(...)` typed without an `as`
// cast.
declare module 'ioredis' {
  interface Redis {
    releaseAuditLock(key: string, token: string): Promise<number>
  }
}

// Register the compare-and-del Lua once. The defineCommand mechanism is the
// ioredis-native way to expose a script as a typed method on the client.
// Idempotent — calling twice with the same name is fine in ioredis.
valkey.defineCommand('releaseAuditLock', {
  numberOfKeys: 1,
  lua: `
    if redis.call('get', KEYS[1]) == ARGV[1] then
      return redis.call('del', KEYS[1])
    else
      return 0
    end
  `,
})

export type LockOutcome<T> =
  | { acquired: true; result: T }
  | { acquired: false; reason: 'already-held' | 'kill-switched' }

export async function withTaskLock<T>(
  name: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<LockOutcome<T>> {
  if (process.env.AUDIT_TASKS_DISABLED === 'true') {
    log.warn(
      { task: name },
      'kill-switch on (AUDIT_TASKS_DISABLED=true); skipping',
    )
    return { acquired: false, reason: 'kill-switched' }
  }

  const key = `audit:task:${name}`
  const token = randomUUID()

  const acquired = await valkey.set(key, token, 'EX', ttlSeconds, 'NX')
  if (acquired !== 'OK') {
    log.info({ task: name }, 'lock already held; another instance is running')
    return { acquired: false, reason: 'already-held' }
  }

  try {
    const result = await fn()
    return { acquired: true, result }
  } finally {
    try {
      await valkey.releaseAuditLock(key, token)
    } catch (err) {
      log.error(
        { task: name, err: err instanceof Error ? err.message : String(err) },
        'lock release failed; lock will self-expire',
      )
    }
  }
}
