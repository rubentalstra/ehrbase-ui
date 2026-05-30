// @/server/db — Drizzle schemas + clients for the platform Postgres.
//
// Consumers import the per-DB barrels:
//
//   import { auditEvents } from '@/server/db/audit'
//   import { user, session } from '@/server/db/auth'
//   import { auditDb, getAuditRetentionDb } from '@/server/db/client'
//   import { authDb } from '@/server/db/auth-client'
//
// The audit DB is append-only (ADR-0013). The auth + demographic DBs are CRUD
// (ADR-0029, ADR-0031). The demographic Drizzle schema is owned by the package
// (@ehrbase-ui/demographic-core/builtin) and re-exported via ./demographic.
export * from './audit/index.ts'
export * from './auth/index.ts'
export * from './demographic/index.ts'
