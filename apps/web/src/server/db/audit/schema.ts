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
  // M4 — patient/staff access of their own audit log is itself audited
  // (§14.4, §14.13). Reuses the existing canonical-form pattern.
  'META_AUDIT_ACCESS',
])

export const auditResourceTypeEnum = pgEnum('audit_resource_type', [
  'EHR',
  'COMPOSITION',
  'TEMPLATE',
  'QUERY',
  'FOLDER',
  'CONTRIBUTION',
  'SYSTEM',
  // M7 demographic provider (ADR-0031): every PARTY op audits with this type.
  'PARTY',
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

export const auditOutcomeEnum = pgEnum('audit_outcome', [
  'SUCCESS',
  'FAILURE',
  'PARTIAL',
])

// Per-event retention class — selects which AUDIT_RETENTION_DAYS_* env var the
// purge job (M4 — src/lib/audit/retention.server.ts) consults to decide when
// the warm row is archived to cold storage and deleted. Tagged at write time:
// auth/break-glass events get AUTH_LOG (1y), BFF + general audits get
// AUDIT_LOG (5y), future clinical writes (M6+) get CLINICAL_RECORD (20y).
// Docs/architecture.md §14.7; ADR-0027.
export const auditRetentionPolicyEnum = pgEnum('audit_retention_policy', [
  'CLINICAL_RECORD',
  'AUDIT_LOG',
  'AUTH_LOG',
  'APP_LOG',
  'SESSION',
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
    // M7 (ADR-0031): the demographic provider name (e.g. 'builtin', 'fhir-r4')
    // that served a PARTY op — forensic adapter attribution (ADR-0024 dual-layer).
    // Nullable: only demographic-provider audits set it. EXCLUDED from the
    // integrity hash (hash-chain.ts) so adding the column does not invalidate the
    // pre-existing chain; the append-only trigger still protects it from mutation.
    sourceAdapterName: text('source_adapter_name'),

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

    // OUTCOME
    outcome: auditOutcomeEnum('outcome').notNull(),
    outcomeDetail: text('outcome_detail'),

    // RETENTION (§14.7 — ADR-0027). Default AUDIT_LOG is the safe write-time
    // tag for the M2 BFF + auth audits; clinical writes (M6+) override per
    // emission site.
    retentionPolicy: auditRetentionPolicyEnum('retention_policy')
      .notNull()
      .default('AUDIT_LOG'),
    // Archive bookkeeping (§14.6). Mutable post-insert by the audit_retention
    // role only; excluded from the canonical hash so flipping it doesn't break
    // the chain (see src/lib/audit/hash-chain.server.ts canonicalize()).
    s3ArchivedAt: timestamp('s3_archived_at', {
      withTimezone: true,
      mode: 'string',
    }),

    // INTEGRITY (§14.5)
    previousHash: text('previous_hash'),
    hash: text('hash').notNull(),
  },
  (t) => [
    index('audit_events_timestamp_idx').on(t.timestamp),
    index('audit_events_actor_user_id_idx').on(t.actorUserId),
    index('audit_events_action_idx').on(t.action),
    // Supports the retention purge job's age-by-policy scan (M4).
    index('audit_events_retention_purge_idx').on(
      t.retentionPolicy,
      t.timestamp,
    ),
  ],
)
