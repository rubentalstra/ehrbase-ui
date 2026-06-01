// postgres.js + Drizzle connection to the app-owned `audit` database (ADR-0041;
// ADR-0013 append-only). The IHE ATNA access trail emitted by the BFF
// (auditAccess) + the demographic provider's AuditSink lands here.
//
// Runtime uses AUDIT_DB_URL, which carries the least-privilege `audit_writer`
// identity: INSERT + SELECT only — no UPDATE / DELETE / DDL (append-only at the
// grant layer + a BEFORE UPDATE OR DELETE trigger; platform-db-init/audit.sql).
// AUDIT_DB_URL is a standalone env var so a production deployment can target a
// physically separate managed Postgres without any code change.

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

// Import-safe (see auth/demographic clients): no throw at module load.
// postgres.js connects lazily on the first query. The default matches
// .env.example + platform-db-init/audit.sql.
const auditDbUrl =
  process.env.AUDIT_DB_URL ??
  'postgres://audit_writer:audit_writer@localhost:5432/audit'

// One pooled connection per process. Audit writes are append-only inserts on the
// hot path of every PHI access; sized below `auth`/`demographic` (which read the
// patient banner on most authed requests).
const sql = postgres(auditDbUrl, { max: 5 })

export const auditDb = drizzle({ client: sql })
