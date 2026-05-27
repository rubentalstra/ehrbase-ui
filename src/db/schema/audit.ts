// Drizzle table for the NEN 7513 AuditEvent (docs/architecture.md §14.2).
//
// This table is the SINGLE SOURCE OF TRUTH for the audit record shape: the
// Zod validation schema (src/lib/audit/schema.ts) is derived from it via
// drizzle-orm/zod, so the two can never drift. The nested actor/source/target
// grouping of §14.2 is flattened to columns here; the logical grouping is
// reconstructed at the edges (logAudit input, integrity verifier).
//
// Append-only: the audit_writer role is granted INSERT + SELECT only (see
// platform-db-init/audit.sql), and the first migration adds a BEFORE UPDATE
// OR DELETE trigger that raises an exception. ADR-0013.

import { sql } from 'drizzle-orm'
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const auditActionEnum = pgEnum('audit_action', [
  'READ',
  'CREATE',
  'UPDATE',
  'DELETE',
  'EXPORT',
  'PRINT',
  'QUERY',
  'LOGIN',
  'LOGIN_FAILED',
  'LOGOUT',
  'SESSION_EXPIRED',
  'TOKEN_REFRESH',
  'ACCESS_DENIED',
  'CONSENT_GRANT',
  'CONSENT_WITHDRAW',
  'ADMIN_CHANGE',
  'EMERGENCY_ACCESS_GRANTED',
])

export const auditResourceTypeEnum = pgEnum('audit_resource_type', [
  'EHR',
  'COMPOSITION',
  'TEMPLATE',
  'QUERY',
  'FOLDER',
  'CONTRIBUTION',
  'SYSTEM',
])

export const auditPurposeEnum = pgEnum('audit_purpose', [
  'TREATMENT',
  'EMERGENCY',
  'BILLING',
  'QUALITY_ASSURANCE',
  'RESEARCH',
  'PATIENT_REQUEST',
  'LEGAL_OBLIGATION',
  'SYSTEM_ADMIN',
])

export const auditLawfulBasisEnum = pgEnum('audit_lawful_basis', [
  '9(2)(a)',
  '9(2)(c)',
  '9(2)(h)',
  '9(2)(i)',
  '9(2)(j)',
])

export const auditOutcomeEnum = pgEnum('audit_outcome', [
  'SUCCESS',
  'FAILURE',
  'PARTIAL',
])

export const auditEvents = pgTable(
  'audit_events',
  {
    // WHEN
    eventId: uuid('event_id').primaryKey(),
    timestamp: timestamp('timestamp', {
      withTimezone: true,
      mode: 'string',
    })
      .notNull()
      .default(sql`now()`),

    // WHO
    actorUserId: text('actor_user_id').notNull(),
    actorUsername: text('actor_username').notNull(),
    actorDisplayName: text('actor_display_name').notNull(),
    actorRoles: jsonb('actor_roles').$type<string[]>().notNull(),
    actorOrganization: text('actor_organization'),
    actorOnBehalfOf: text('actor_on_behalf_of'),

    // WHERE FROM
    sourceIpAddress: text('source_ip_address').notNull(),
    sourceUserAgent: text('source_user_agent').notNull(),
    sourceSessionId: text('source_session_id').notNull(),
    sourceCorrelationId: uuid('source_correlation_id').notNull(),

    // WHAT (action)
    action: auditActionEnum('action').notNull(),

    // WHAT (target)
    targetEhrId: uuid('target_ehr_id'),
    targetSubjectIdHash: text('target_subject_id_hash'),
    targetResourceType: auditResourceTypeEnum('target_resource_type'),
    targetResourceId: text('target_resource_id'),
    targetArchetypeId: text('target_archetype_id'),

    // WHY
    purpose: auditPurposeEnum('purpose').notNull(),
    lawfulBasis: auditLawfulBasisEnum('lawful_basis').notNull(),

    // OUTCOME
    outcome: auditOutcomeEnum('outcome').notNull(),
    outcomeDetail: text('outcome_detail'),

    // INTEGRITY (§14.5)
    previousHash: text('previous_hash'),
    hash: text('hash').notNull(),
  },
  (t) => [
    index('audit_events_timestamp_idx').on(t.timestamp),
    index('audit_events_actor_user_id_idx').on(t.actorUserId),
    index('audit_events_action_idx').on(t.action),
  ],
)
