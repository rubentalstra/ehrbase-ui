// drizzle-kit config for the app-owned `audit` database (ADR-0012).
//
// Migrations run as the schema owner (AUDIT_DB_OWNER_URL → audit_owner), NOT
// the runtime writer. The owner owns the table; default privileges then grant
// the writer INSERT + SELECT only (platform-db-init/audit.sql).

import { defineConfig } from 'drizzle-kit'

const ownerUrl = process.env.AUDIT_DB_OWNER_URL
if (!ownerUrl) {
  throw new Error('AUDIT_DB_OWNER_URL must be set to run drizzle-kit migrations.')
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/audit/schema.ts',
  out: './src/server/db/audit/migrations',
  dbCredentials: { url: ownerUrl },
  strict: true,
  verbose: true,
})
