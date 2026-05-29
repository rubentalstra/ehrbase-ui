// Server-only data feed for the patient-facing access log (Art. 15 /
// architecture.md §14.8). Pulls the audit events where the current authed
// user is the ACTOR — "my own actions" — and emits a META_AUDIT_ACCESS
// event so the audit-on-audit chain (§14.4, §14.13) records the read.
//
// Type contract (input + output) lives in access-log.functions.ts so the
// client + server share a single source. This file only consumes those
// types — never re-declares the shape — so a column change in the audit
// table cascades automatically.
//
// Scope decision (PR-B planning round): we ship the "my own actions" feed
// in v1.0 — it works for any authed role (clinician, admin, audit reviewer,
// researcher) reviewing the events they themselves produced. True
// patient-facing Art. 15 (events targeting a patient's pseudonymised
// subject ID via a patient OIDC) waits for the v1.x patient portal
// (docs/v1.x-roadmap.md). The route name `/me/access-log` is shared.

import { desc, eq, count } from 'drizzle-orm'

import { auditDb } from '@ehrbase-ui/db-platform/client'
import { auditEvents } from '@ehrbase-ui/db-platform/audit'
import { logAudit } from '@ehrbase-ui/audit'
import { auth as betterAuth } from '@/lib/auth/auth.server'
import type {
  AccessLogPageInput,
  MyAuditEventsResponse,
} from './access-log.functions'
import { MAX_ACCESS_LOG_LIMIT } from './access-log.functions'

function unauthorized(): Response {
  return new Response(JSON.stringify({ code: 'UNAUTHENTICATED' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  })
}

export async function fetchMyAuditEvents(
  input: AccessLogPageInput,
): Promise<MyAuditEventsResponse> {
  const { getRequest } = await import('@tanstack/react-start/server')
  const session = await betterAuth.api.getSession({
    headers: getRequest().headers,
  })
  if (!session) throw unauthorized()
  const auth: {
    sid: string
    user: { id: string; email: string; name: string; roles: string[] }
  } = {
    sid: session.session.token,
    user: {
      id: session.user.id,
      email: session.user.email ?? '',
      name: session.user.name ?? '',
      roles: [],
    },
  }
  const page = Math.max(0, Math.floor(input.page))
  const limit = Math.min(
    MAX_ACCESS_LOG_LIMIT,
    Math.max(1, Math.floor(input.limit)),
  )
  const offset = page * limit

  // Display projection: never reveals targetSubjectIdHash or raw resourceId.
  // Those carry pseudonymised PHI references; the patient seeing "READ on
  // composition <archetype>" is enough for the Art. 15 disclosure surface.
  const rows = await auditDb
    .select({
      eventId: auditEvents.eventId,
      timestamp: auditEvents.timestamp,
      action: auditEvents.action,
      resourceType: auditEvents.targetResourceType,
      outcome: auditEvents.outcome,
      outcomeDetail: auditEvents.outcomeDetail,
      purpose: auditEvents.purpose,
    })
    .from(auditEvents)
    .where(eq(auditEvents.actorUserId, auth.user.id))
    .orderBy(desc(auditEvents.timestamp))
    .limit(limit)
    .offset(offset)

  const totalRow = await auditDb
    .select({ value: count() })
    .from(auditEvents)
    .where(eq(auditEvents.actorUserId, auth.user.id))
  const total = totalRow[0]?.value ?? 0

  // Auditing the audit-log read — §14.4 (audit logs are themselves PHI).
  // Fire-and-forget; logAudit already swallows + stderrs on failure.
  await logAudit({
    actor: {
      userId: auth.user.id,
      username: auth.user.email,
      displayName: auth.user.name,
      roles: auth.user.roles,
    },
    action: 'META_AUDIT_ACCESS',
    target: { resourceType: 'SYSTEM' },
    purpose: 'PATIENT_REQUEST',
    outcome: 'SUCCESS',
    outcomeDetail: `access-log self-read page=${page} limit=${limit} total=${total}`,
    retentionPolicy: 'AUDIT_LOG',
    source: { sessionId: auth.sid },
  })

  return {
    rows,
    total,
    page,
    limit,
    hasMore: offset + rows.length < total,
  }
}
