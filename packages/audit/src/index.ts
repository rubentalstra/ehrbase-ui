// @ehrbase-ui/audit — package main entry.
//
// This re-exports the types-only surface. Server-side runtime lives at the
// `./server` subpath (`import { logAudit } from '@ehrbase-ui/audit/server'`).
// See ./types.ts for the rationale.

export type {
  AuditAction,
  AuditResourceType,
  AuditPurpose,
  AuditOutcome,
  AuditRetentionPolicy,
  AuditEventRow,
} from './types.ts'
