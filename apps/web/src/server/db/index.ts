// @/server/db — Drizzle schemas + clients for the platform Postgres.
//
// Consumers import the per-DB barrels:
//
//   import { user, session } from '@/server/db/auth'
//   import { authDb } from '@/server/db/auth-client'
//
// The auth + demographic DBs are CRUD (ADR-0029, ADR-0031). The demographic
// Drizzle schema is owned by the package
// (@ehrbase-ui/demographic-core/builtin) and re-exported via ./demographic.
export * from './auth/index.ts'
export * from './demographic/index.ts'
