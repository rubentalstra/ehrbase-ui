// @/server/audit — pure-type, browser-safe public surface.
//
// This is the package's MAIN entry (package.json `.` export). It pulls in
// NO Node-only modules (no `node:crypto`, no Drizzle, no Postgres driver)
// so it is safe to import from any UI surface — `import type` calls survive
// production-bundle tree-shaking without leaking server code into the
// client bundle.
//
// Server-side runtime (logAudit, the hash chain, the retention purge job,
// the cold-store adapters, schema validators, the request-context provider,
// etc.) is exported from the `./server` subpath. Use that import from any
// `.server.ts` / `.functions.ts` server-handler file and from server-only
// packages (@/server/auth, @/server/bff, …):
//
//   import { logAudit } from '@/server/audit/runtime'
//
// The split is the architectural fence between PHI-touching runtime and
// types-only client consumers (route components rendering audit-log rows).

// String-literal unions — match the pgEnum values in
// packages/db-platform/src/audit/schema.ts. Keep these in sync: a column
// added to the enum at the schema level should be added here too.

export type AuditAction =
  | 'READ'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'EXPORT'
  | 'PRINT'
  | 'QUERY'
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'SESSION_EXPIRED'
  | 'TOKEN_REFRESH'
  | 'ACCESS_DENIED'
  | 'CONSENT_GRANT'
  | 'CONSENT_WITHDRAW'
  | 'ADMIN_CHANGE'
  | 'EMERGENCY_ACCESS_GRANTED'
  | 'META_AUDIT_ACCESS'

export type AuditResourceType =
  | 'EHR'
  | 'COMPOSITION'
  | 'TEMPLATE'
  | 'QUERY'
  | 'FOLDER'
  | 'CONTRIBUTION'
  | 'SYSTEM'

export type AuditPurpose =
  | 'TREATMENT'
  | 'EMERGENCY'
  | 'BILLING'
  | 'QUALITY_ASSURANCE'
  | 'RESEARCH'
  | 'PATIENT_REQUEST'
  | 'LEGAL_OBLIGATION'
  | 'SYSTEM_ADMIN'

export type AuditOutcome = 'SUCCESS' | 'FAILURE' | 'PARTIAL'

export type AuditRetentionPolicy =
  | 'CLINICAL_RECORD'
  | 'AUDIT_LOG'
  | 'AUTH_LOG'
  | 'APP_LOG'
  | 'SESSION'

/**
 * The wire shape of a stored audit row, as a CLIENT-RENDERABLE object.
 * Mirrors the columns in `audit_events` (db-platform/audit/schema.ts) but
 * declared as a plain TS interface so types.ts has zero Drizzle dependency.
 *
 * The server-side equivalent — `AuditEventRowSchema` (Zod) — lives in
 * `@/server/audit/runtime`. The two MUST stay in sync; the contract
 * test suite asserts the shapes overlap.
 */
export interface AuditEventRow {
  eventId: string
  timestamp: string
  actorUserId: string
  actorUsername: string
  actorDisplayName: string
  actorRoles: string[]
  actorOrganization: string | null
  actorOnBehalfOf: string | null
  sourceIpAddress: string
  sourceUserAgent: string
  sourceSessionId: string | null
  sourceCorrelationId: string | null
  action: AuditAction
  targetEhrId: string | null
  targetSubjectIdHash: string | null
  targetResourceType: AuditResourceType | null
  targetResourceId: string | null
  targetArchetypeId: string | null
  purpose: AuditPurpose
  outcome: AuditOutcome
  outcomeDetail: string | null
  retentionPolicy: AuditRetentionPolicy
  s3ArchivedAt: string | null
  previousHash: string | null
  hash: string
}
