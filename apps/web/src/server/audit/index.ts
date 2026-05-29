// @/server/audit — package main entry.
//
// This re-exports the types-only surface. Server-side runtime lives at the
// `./server` subpath (`import { logAudit } from '@/server/audit/runtime'`).
// See ./types.ts for the rationale.

export type {
  AuditAction,
  AuditResourceType,
  AuditPurpose,
  AuditOutcome,
  AuditRetentionPolicy,
  AuditEventRow,
} from './types.ts'
