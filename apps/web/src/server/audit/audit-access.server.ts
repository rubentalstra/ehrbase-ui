// auditAccess — the IHE ATNA access-trail emitter (ADR-0041, Inviolable rule 1).
//
// Every PHI access (read / write / query) calls this; it builds a conformant
// DICOM AuditMessage (atna-message.ts) and appends one row to the `audit`
// Postgres schema (append-only; audit-client.ts). M9 adds the syslog/TLS
// forwarder to an external Audit Record Repository + wires this into the
// `callEhrbase` BFF choke point for composition/query access.
//
// RESILIENCE: an audit-DB hiccup must not break the clinical operation, so an
// insert failure is caught + logged loudly (appLog redacts; no PHI) rather than
// thrown. Durable-queue + integrity (lossless guarantees) are deferred hardening.
//
// `.server.ts`: imports the DB client + env — never reaches the client bundle.

import { auditEvent } from '@/server/db/audit'
import { auditDb } from '@/server/db/audit-client'
import { appLog } from '@/server/observability/log'

import { buildAtnaMessage, type AuditAccessInput } from './atna-message.ts'

function auditSource(): { auditSourceId: string; auditEnterpriseSiteId?: string } {
  const enterprise = process.env.ATNA_ENTERPRISE_SITE_ID
  return {
    auditSourceId: process.env.ATNA_AUDIT_SOURCE_ID ?? 'ehrbase-ui',
    ...(enterprise ? { auditEnterpriseSiteId: enterprise } : {}),
  }
}

/** Append one IHE ATNA access event. Never throws (audit must not block PHI ops). */
export async function auditAccess(input: AuditAccessInput): Promise<void> {
  try {
    const message = buildAtnaMessage(input, auditSource())
    await auditDb.insert(auditEvent).values({
      eventId: crypto.randomUUID(),
      eventTime: input.eventTime,
      action: input.action,
      outcome: message.eventIdentification.eventOutcomeIndicator,
      actorUserId: input.actor.userId,
      actorUsername: input.actor.username,
      actorRoles: input.actor.roles,
      purposeOfUse: input.purposeOfUse ?? 'TREATMENT',
      resourceType: input.resource.type,
      resourceId: input.resource.id ?? null,
      subjectIdHash: input.subjectIdHash ?? null,
      sourceComponent: input.sourceComponent,
      correlationId: input.correlationId ?? null,
      detail: input.detail ?? null,
      message,
    })
  } catch (err) {
    appLog.error(
      {
        correlationId: input.correlationId,
        action: input.action,
        resourceType: input.resource.type,
        outcome: input.outcome,
        err: err instanceof Error ? err.message : 'unknown',
      },
      'audit_event insert failed — access NOT recorded',
    )
  }
}
