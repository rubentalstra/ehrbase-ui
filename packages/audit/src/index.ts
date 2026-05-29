// @ehrbase-ui/audit — NEN-7513 audit logger + integrity + retention barrel.
//
// Public surface — every PHI-touching server function imports from here per
// CLAUDE.md Inviolable rule 1 + ADR-0024 dual-layer.

export { logAudit } from './logger.server.ts'
export {
  setAuditRequestContextProvider,
  _resetAuditRequestContextProviderForTests,
  type AuditRequestContextProvider,
} from './request-context.ts'
export { pseudonymizeSubject } from './pseudonymize.server.ts'
export {
  CHAIN_HEAD_KEY,
  canonicalize,
  computeHash,
  getChainHead,
  setChainHead,
} from './hash-chain.server.ts'
export {
  verifyAuditChain,
  recomputeHash,
  type IntegrityResult,
} from './integrity.server.ts'
export {
  runIntegrityJob,
  type IntegrityJobReport,
} from './integrity-job.server.ts'
export {
  purgeExpiredAuditEvents,
  retentionCutoffDays,
  cutoffDateFor,
  type PurgeReport,
} from './retention.server.ts'
export { withTaskLock, type LockOutcome } from './task-lock.server.ts'
export {
  getColdStorageProvider,
  _resetColdStorageProviderForTests,
} from './cold-store.factory.server.ts'
export {
  type ColdStorageMode,
  type ColdStorageProvider,
  objectKeyFor,
  retainUntilDateFor,
  SeaweedFsColdStore,
  S3ColdStore,
  NoopColdStore,
} from './cold-store.server.ts'
export { persistAuditEvent } from './store.server.ts'
export {
  AuditAction,
  AuditResourceType,
  AuditPurpose,
  AuditOutcome,
  AuditRetentionPolicy,
  AuditEventInsertSchema,
  AuditEventRowSchema,
  LogAuditInputSchema,
  type AuditEventInsert,
  type AuditEventRow,
  type LogAuditInput,
} from './schema.ts'
