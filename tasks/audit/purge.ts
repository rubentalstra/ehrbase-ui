// Nitro scheduled task — daily audit-event retention purge (M4, ADR-0026/0027).
//
// Wired via `scheduledTasks` in vite.config.ts (default cron 0 4 * * *,
// override via AUDIT_PURGE_CRON). Also reachable manually at
// /_nitro/tasks/audit:purge (role-gated to `audit-reviewer`). The archive +
// transactional warm-delete sits in src/lib/audit/retention.server.ts.

import { defineTask } from 'nitro/task'

import { purgeExpiredAuditEvents } from '@/lib/audit/retention.server'
import { withTaskLock } from '@/lib/audit/task-lock.server'

// Lock TTL = job-duration × 1.5. The job batches at 100 rows by default
// (AUDIT_PURGE_BATCH_SIZE override); 30 min covers a large backlog and still
// self-clears before the next nightly firing.
const LOCK_TTL_SECONDS = 60 * 45

export default defineTask<unknown>({
  meta: {
    name: 'audit:purge',
    description:
      'Archive + delete audit events past their per-policy retention (§14.7).',
  },
  async run() {
    const outcome = await withTaskLock('purge', LOCK_TTL_SECONDS, async () => {
      return purgeExpiredAuditEvents()
    })
    if (!outcome.acquired) return { result: { skipped: outcome.reason } }
    return { result: { reports: outcome.result } }
  },
})
