// drizzle-kit config for the app-owned `demographic` database (ADR-0031; arch
// §M7). Migrations run as the schema owner (DEMOGRAPHIC_DB_OWNER_URL →
// demographic_owner), NOT the runtime writer. Unlike `audit` (append-only,
// ADR-0013), the demographic store is CRUD: the built-in adapter inserts version
// snapshots, updates the current row, and rebuilds the extracted index tables —
// so the writer gets full CRUD (platform-db-init/demographic.sql), like `auth`.
//
// The schema is re-exported from @ehrbase-ui/demographic-core/builtin (the
// adapter owns it); this config points drizzle-kit at the re-export.

import { defineConfig } from 'drizzle-kit'

const ownerUrl = process.env.DEMOGRAPHIC_DB_OWNER_URL
if (!ownerUrl) {
  throw new Error(
    'DEMOGRAPHIC_DB_OWNER_URL must be set to run drizzle-kit migrations.',
  )
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/demographic/schema.ts',
  out: './src/server/db/demographic/migrations',
  dbCredentials: { url: ownerUrl },
  strict: true,
  verbose: true,
})
