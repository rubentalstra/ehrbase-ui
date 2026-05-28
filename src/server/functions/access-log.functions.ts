// createServerFn wrappers for the /me/access-log surface (M4 — Art. 15 /
// architecture.md §14.8). This module is the CLIENT-IMPORTABLE BOUNDARY for
// the feature: it owns the full contract (input schema + output types). The
// .server.ts beside it consumes these types and runs the actual fetch +
// audit emit; it never re-declares the shape. Result: a column change in
// the audit table flows through Drizzle → AuditEventRow → MyAuditEventDisplay
// here without anyone manually re-typing the projection.
//
// Pattern follows src/lib/auth/require-auth.ts: server module is dynamically
// imported inside the handler so server-only graph never reaches the client
// (CLAUDE.md rules 7 + 8).

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import type { AuditEventRow } from '@/lib/audit/schema'

// ─── Contract ─────────────────────────────────────────────────────────────
// Input
export const AccessLogPageInputSchema = z.object({
  page: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(20),
})
export type AccessLogPageInput = z.infer<typeof AccessLogPageInputSchema>

// Output — Pick from the source-of-truth row type so adding/removing a
// column in src/db/schema/audit.ts surfaces at compile time here, not as a
// silent runtime drift.
export type MyAuditEventDisplay = Pick<
  AuditEventRow,
  'eventId' | 'timestamp' | 'action' | 'outcome' | 'outcomeDetail' | 'purpose'
> & {
  // The DB column is `target_resource_type`; we expose it as `resourceType`
  // for UI clarity. Kept narrow so the projection stays a true subset.
  resourceType: AuditEventRow['targetResourceType']
}

export type MyAuditEventsResponse = {
  rows: MyAuditEventDisplay[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

export const MAX_ACCESS_LOG_LIMIT = 100

// ─── Server fn ────────────────────────────────────────────────────────────
export const getMyAuditEvents = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => AccessLogPageInputSchema.parse(d))
  .handler(async ({ data }): Promise<MyAuditEventsResponse> => {
    const { fetchMyAuditEvents } = await import('./access-log.server')
    return fetchMyAuditEvents(data)
  })
