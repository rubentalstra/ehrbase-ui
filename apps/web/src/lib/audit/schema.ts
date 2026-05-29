// NEN 7513 audit-event schema (docs/architecture.md §14.2).
//
// The Drizzle table (src/db/schema/audit.ts) is the single source of truth for
// the persisted shape; the row validators here are DERIVED from it via
// drizzle-orm/zod (built-in, targets zod/v4 — matching our pinned Zod 4.x).
// There is no standalone `drizzle-zod` dependency: that package is deprecated
// as of drizzle-orm@1.0.0-beta.15 (ADR-0012). Because the validators are
// generated from the table, the schema and the DB column set cannot drift.
//
// On top of the derived row schema we expose:
//   - convenience Zod enums for the §14.2 controlled vocabularies, and
//   - a nested caller-facing input schema (actor/source/target grouping) that
//     logAudit() flattens into a row before the durable write.

import { createInsertSchema, createSelectSchema } from 'drizzle-orm/zod'
import { z } from 'zod'

import {
  auditActionEnum,
  auditEvents,
  auditOutcomeEnum,
  auditPurposeEnum,
  auditResourceTypeEnum,
  auditRetentionPolicyEnum,
} from '@/db/schema/audit'

// ─── Controlled vocabularies (derived from the pg enums) ──────────────────
export const AuditAction = z.enum(auditActionEnum.enumValues)
export const AuditResourceType = z.enum(auditResourceTypeEnum.enumValues)
export const AuditPurpose = z.enum(auditPurposeEnum.enumValues)
export const AuditOutcome = z.enum(auditOutcomeEnum.enumValues)
export const AuditRetentionPolicy = z.enum(auditRetentionPolicyEnum.enumValues)

export type AuditAction = z.infer<typeof AuditAction>
export type AuditResourceType = z.infer<typeof AuditResourceType>
export type AuditPurpose = z.infer<typeof AuditPurpose>
export type AuditOutcome = z.infer<typeof AuditOutcome>
export type AuditRetentionPolicy = z.infer<typeof AuditRetentionPolicy>

// ─── Persisted row validators (derived from the table) ────────────────────
// jsonb columns derive to a loose Json type; refine actorRoles back to the
// string[] the table's $type declares so the validated row matches the
// Drizzle insert type exactly (no drift, no cast).
export const AuditEventInsertSchema = createInsertSchema(auditEvents, {
  actorRoles: z.array(z.string()),
})
export const AuditEventRowSchema = createSelectSchema(auditEvents, {
  actorRoles: z.array(z.string()),
})

export type AuditEventInsert = z.infer<typeof AuditEventInsertSchema>
export type AuditEventRow = z.infer<typeof AuditEventRowSchema>

// ─── Caller-facing input (nested grouping per §14.2) ──────────────────────
// logAudit() supplies eventId, timestamp, source defaults and the hash chain;
// callers provide everything else. `source` may be partially overridden (the
// sessionId in particular is filled by callers that hold an authed session).
export const LogAuditInputSchema = z.object({
  actor: z.object({
    userId: z.string(),
    username: z.string(),
    displayName: z.string(),
    roles: z.array(z.string()),
    organization: z.string().optional(),
    onBehalfOf: z.string().optional(),
  }),
  action: AuditAction,
  target: z
    .object({
      ehrId: z.string().uuid().optional(),
      subjectIdHash: z.string().optional(),
      resourceType: AuditResourceType,
      resourceId: z.string().optional(),
      archetypeId: z.string().optional(),
    })
    .optional(),
  purpose: AuditPurpose,
  outcome: AuditOutcome,
  outcomeDetail: z.string().optional(),
  // Optional override; the writer falls back to the Drizzle column default
  // ('AUDIT_LOG') when the caller omits it. Auth + break-glass emit AUTH_LOG;
  // BFF + general audits get the default; future clinical writes override
  // explicitly (CLINICAL_RECORD).
  retentionPolicy: AuditRetentionPolicy.optional(),
  source: z
    .object({
      ipAddress: z.string().optional(),
      userAgent: z.string().optional(),
      sessionId: z.string().optional(),
      correlationId: z.string().optional(),
    })
    .optional(),
})

export type LogAuditInput = z.infer<typeof LogAuditInputSchema>
