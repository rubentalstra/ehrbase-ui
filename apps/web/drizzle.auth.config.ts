// drizzle-kit config for the app-owned `auth` database (ADR-0028, ADR-0029).
//
// Migrations run as the schema owner (AUTH_DB_OWNER_URL → auth_owner), NOT
// the runtime writer (AUTH_DB_URL → auth_writer). The owner owns the schema;
// default privileges then grant the writer full CRUD on the Better Auth
// tables (platform-db-init/auth.sql). This DB hosts Better Auth's core
// tables (user / session / account / verification) plus plugin tables
// (admin extension columns, organization / member / invitation / team /
// teamMember, ssoProvider) — see src/db/schema/auth.ts.

import { defineConfig } from 'drizzle-kit'

const ownerUrl = process.env.AUTH_DB_OWNER_URL
if (!ownerUrl) {
  throw new Error(
    'AUTH_DB_OWNER_URL must be set to run drizzle-kit migrations.',
  )
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/auth/schema.ts',
  out: './src/server/db/auth/migrations',
  dbCredentials: { url: ownerUrl },
  strict: true,
  verbose: true,
})
