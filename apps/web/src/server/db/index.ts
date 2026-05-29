// @/server/db — Drizzle schemas + clients for the platform Postgres.
//
// Consumers import the per-DB barrels:
//
//   import { auditEvents } from '@/server/db/audit'
//   import { user, session } from '@/server/db/auth'
//   import { auditDb, getAuditRetentionDb } from '@/server/db/client'
//   import { authDb } from '@/server/db/auth-client'
//
// The audit DB is append-only (ADR-0013). The auth DB is CRUD (ADR-0029).
// M7 demographic schema lands here too (per ADR-0031 + the M7 milestone).
export * from './audit/index.ts'
export * from './auth/index.ts'
