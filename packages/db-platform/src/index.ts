// @ehrbase-ui/db-platform — Drizzle schemas + clients for the platform Postgres.
//
// Consumers import the per-DB barrels:
//
//   import { auditEvents } from '@ehrbase-ui/db-platform/audit'
//   import { user, session } from '@ehrbase-ui/db-platform/auth'
//   import { auditDb, getAuditRetentionDb } from '@ehrbase-ui/db-platform/client'
//   import { authDb } from '@ehrbase-ui/db-platform/auth-client'
//
// The audit DB is append-only (ADR-0013). The auth DB is CRUD (ADR-0029).
// M7 demographic schema lands here too (per ADR-0031 + the M7 milestone).
export * from './audit/index.ts'
export * from './auth/index.ts'
