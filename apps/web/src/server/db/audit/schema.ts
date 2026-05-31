// Drizzle schema for the app-owned `audit` database (ADR-0041; ADR-0013
// append-only). One row per PHI access — the IHE ATNA access trail emitted by
// the BFF (`auditAccess`) + the demographic provider's `AuditSink`.
//
// APPEND-ONLY (ADR-0013): the `audit_writer` role is granted INSERT + SELECT only
// (platform-db-init/audit.sql); the first migration adds a BEFORE UPDATE OR
// DELETE trigger as the DB-enforced second layer. The tamper-evidence HASH CHAIN
// + retention/purge + cold-store are DEFERRED hardening (ADR-0041 / CLAUDE.md
// "Deferred (post-core)") — not in M7.
//
// PHI rule (rule 2): no name / DOB / raw national id in any column. A patient is
// referenced by an opaque id and/or the HMAC-SHA256 `subjectIdHash` pseudonym.
// `message` is the full Zod-`AtnaAuditMessageSchema`-validated DICOM AuditMessage
// (no `as`; rule 3).

import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import type { AtnaAuditMessage } from '../../audit/atna-message.ts'

/** The access verbs recorded; mapped to a DICOM EventActionCode in the message. */
export const auditActionEnum = pgEnum('audit_action', [
  'CREATE',
  'READ',
  'UPDATE',
  'DELETE',
  'QUERY',
  'EXECUTE',
  'ACCESS_DENIED',
])

export const auditEvent = pgTable(
  'audit_event',
  {
    /** App-supplied UUID (Web Crypto `randomUUID`; ADR-0037) — no DB pgcrypto dep. */
    eventId: uuid('event_id').primaryKey(),
    recordedAt: timestamp('recorded_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .default(sql`now()`),
    /** IHE ATNA EventDateTime (when the access happened); ISO-8601 string. */
    eventTime: timestamp('event_time', { withTimezone: true, mode: 'string' }).notNull(),
    action: auditActionEnum('action').notNull(),
    /** DICOM EventOutcomeIndicator: 0 success / 4 minor / 8 serious / 12 major. */
    outcome: integer('outcome').notNull(),
    actorUserId: text('actor_user_id').notNull(),
    actorUsername: text('actor_username').notNull(),
    actorRoles: jsonb('actor_roles').$type<string[]>().notNull(),
    purposeOfUse: text('purpose_of_use').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    /** HMAC-SHA256 pseudonym of a national identifier in scope (never the raw value). */
    subjectIdHash: text('subject_id_hash'),
    /** Emitting component, e.g. 'demographic:builtin' or 'bff'. */
    sourceComponent: text('source_component').notNull(),
    correlationId: text('correlation_id'),
    /** Machine tag only — never PHI. */
    detail: text('detail'),
    /** The full IHE ATNA / DICOM AuditMessage. */
    message: jsonb('message').$type<AtnaAuditMessage>().notNull(),
  },
  (t) => [
    index('audit_event_subject_idx').on(t.subjectIdHash),
    index('audit_event_actor_idx').on(t.actorUserId),
    index('audit_event_recorded_idx').on(t.recordedAt),
    index('audit_event_resource_idx').on(t.resourceType),
  ],
)

export type AuditEventRow = typeof auditEvent.$inferSelect
export type AuditEventInsert = typeof auditEvent.$inferInsert
