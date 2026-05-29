// Retention purge job (docs/architecture.md §14.7; ADR-0027).
//
// For each retention policy, compute the warm-tier cutoff from the matching
// AUDIT_RETENTION_DAYS_* env var and process every event older than the cutoff:
//   1. Archive to the configured cold-storage provider (best-effort or WORM).
//   2. Verify the cold object exists (HEAD round-trip).
//   3. Stamp the warm row's s3_archived_at column.
//   4. DELETE the warm row.
//
// Order matters: archive-before-delete prevents a partial run from losing
// data; the verify step rejects a silent archive failure. The DELETE happens
// under the audit_retention role — the ONLY role with the controlled bypass
// of the ADR-0013 append-only trigger.

import { and, lt, eq, asc } from 'drizzle-orm'
import pino from 'pino'

import { getAuditRetentionDb } from '@ehrbase-ui/db-platform/client'
import { auditEvents } from '@ehrbase-ui/db-platform/audit'
import { getColdStorageProvider } from './cold-store.factory'
import type { AuditEventRow, AuditRetentionPolicy } from './schema'

const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { module: 'audit/retention' },
})

const DEFAULT_DAYS: Record<AuditRetentionPolicy, number> = {
  CLINICAL_RECORD: 7300, // 20y
  AUDIT_LOG: 1825, // 5y
  AUTH_LOG: 365, // 1y
  APP_LOG: 90,
  SESSION: 2,
}

function cutoffEnvKey(p: AuditRetentionPolicy): string {
  return `AUDIT_RETENTION_DAYS_${p}`
}

export function retentionCutoffDays(policy: AuditRetentionPolicy): number {
  const raw = process.env[cutoffEnvKey(policy)]
  if (raw === undefined || raw === '') return DEFAULT_DAYS[policy]
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(
      `${cutoffEnvKey(policy)} must be a positive number (got "${raw}")`,
    )
  }
  return Math.floor(n)
}

export function cutoffDateFor(
  policy: AuditRetentionPolicy,
  now: Date = new Date(),
): Date {
  const d = new Date(now)
  d.setUTCDate(d.getUTCDate() - retentionCutoffDays(policy))
  return d
}

export type PurgeReport = {
  policy: AuditRetentionPolicy
  archived: number
  deleted: number
  errors: number
}

const PURGE_BATCH = Number(process.env.AUDIT_PURGE_BATCH_SIZE ?? 100)

async function purgeOneEvent(
  db: ReturnType<typeof getAuditRetentionDb>,
  cold: ReturnType<typeof getColdStorageProvider>,
  row: AuditEventRow,
): Promise<{ archived: boolean; deleted: boolean }> {
  let key: string
  try {
    key = await cold.archive(row)
  } catch (err) {
    log.error(
      {
        eventId: row.eventId,
        err: err instanceof Error ? err.message : String(err),
      },
      'cold-store archive failed',
    )
    return { archived: false, deleted: false }
  }

  const verified = await cold.verify(row.eventId, key)
  if (!verified) {
    log.error(
      { eventId: row.eventId, key },
      'cold-store verify failed; refusing to delete warm row',
    )
    return { archived: false, deleted: false }
  }

  // Stamp + delete in a single transaction. Either both succeed or both roll
  // back — never an orphan warm row marked archived but not deleted.
  await db.transaction(async (tx) => {
    await tx
      .update(auditEvents)
      .set({ s3ArchivedAt: new Date().toISOString() })
      .where(eq(auditEvents.eventId, row.eventId))
    await tx.delete(auditEvents).where(eq(auditEvents.eventId, row.eventId))
  })

  return { archived: true, deleted: true }
}

export async function purgeExpiredAuditEvents(
  policies: AuditRetentionPolicy[] = [
    'SESSION',
    'APP_LOG',
    'AUTH_LOG',
    'AUDIT_LOG',
    'CLINICAL_RECORD',
  ],
  now: Date = new Date(),
): Promise<PurgeReport[]> {
  const db = getAuditRetentionDb()
  const cold = getColdStorageProvider()
  const reports: PurgeReport[] = []

  for (const policy of policies) {
    const cutoff = cutoffDateFor(policy, now)
    const report: PurgeReport = { policy, archived: 0, deleted: 0, errors: 0 }

    // Process in bounded batches so a million-row backlog doesn't block the
    // entire cron firing on a single transaction.
    // The (retention_policy, timestamp) index supports this scan.
    for (;;) {
      const batch = await db
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.retentionPolicy, policy),
            lt(auditEvents.timestamp, cutoff.toISOString()),
          ),
        )
        .orderBy(asc(auditEvents.timestamp))
        .limit(PURGE_BATCH)

      if (batch.length === 0) break

      for (const row of batch) {
        const r = await purgeOneEvent(db, cold, row)
        if (r.archived) report.archived += 1
        if (r.deleted) report.deleted += 1
        if (!r.archived || !r.deleted) report.errors += 1
      }

      if (batch.length < PURGE_BATCH) break
    }

    log.info(report, 'retention purge policy complete')
    reports.push(report)
  }

  return reports
}
