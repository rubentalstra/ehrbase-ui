// @/server/audit — IHE ATNA access-trail barrel (ADR-0041). Every PHI-touching
// server function emits through `auditAccess` (Inviolable rule 1); the
// demographic provider emits through `PostgresAuditSink`. Server-only (re-exports
// `.server` modules that pull the audit DB client).

export { auditAccess } from './audit-access.server.ts'
export { PostgresAuditSink } from './audit-sink.server.ts'
export {
  buildAtnaMessage,
  AtnaAuditMessageSchema,
  AuditActionSchema,
  type AtnaAuditMessage,
  type AuditAccessInput,
  type AuditAction,
} from './atna-message.ts'
