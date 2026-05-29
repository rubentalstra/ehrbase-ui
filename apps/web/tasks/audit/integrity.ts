// Nitro scheduled task — nightly audit-chain integrity verifier (M4, ADR-0026).
//
// Wired via `scheduledTasks` in vite.config.ts (default cron 0 3 * * *,
// override via AUDIT_INTEGRITY_CRON). Also reachable manually at
// /_nitro/tasks/audit:integrity (role-gated to `audit-reviewer`). The work
// itself lives in src/lib/audit/integrity-job.server.ts; this file is just
// the Nitro entry point + the leader-elect lock that makes multi-instance
// firing safe.

import { defineTask } from 'nitro/task'

import { runIntegrityJob } from '@ehrbase-ui/audit'
import { withTaskLock } from '@ehrbase-ui/audit'

// Lock TTL = job-duration × 1.5. The verifier reads every audit row and walks
// the chain in-memory; budgeting 10 min is generous for a v1.0 audit volume.
const LOCK_TTL_SECONDS = 60 * 15

export default defineTask<unknown>({
  meta: {
    name: 'audit:integrity',
    description:
      'Verify the audit-event hash chain and alert the DPO on failure (§14.5).',
  },
  async run() {
    const outcome = await withTaskLock(
      'integrity',
      LOCK_TTL_SECONDS,
      runIntegrityJob,
    )
    if (!outcome.acquired) return { result: { skipped: outcome.reason } }
    return { result: outcome.result }
  },
})
