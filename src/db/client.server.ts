// postgres.js + Drizzle connection to the app-owned `audit` database
// (docs/architecture.md §14; ADR-0012, ADR-0013).
//
// Runtime uses AUDIT_DB_URL, which carries the least-privilege `audit_writer`
// identity (INSERT + SELECT only). AUDIT_DB_URL is a standalone env var so a
// production deployment can target a physically separate managed Postgres
// without any code change — the logical-isolation-now / physical-promotion
// path from the plan.

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

// Import-safe (see valkey.server.ts): no throw at module load. postgres.js
// connects lazily on first query, so an unset/unreachable DB only surfaces when
// an audit write is actually attempted. The default matches .env.example;
// production always sets AUDIT_DB_URL (and may point it at a separate Postgres).
const auditDbUrl =
  process.env.AUDIT_DB_URL ??
  'postgres://audit_writer:audit_writer@localhost:5432/audit'

// One pooled connection per process. postgres.js manages the pool; the audit
// write path is low-volume relative to read traffic, so a small pool is fine.
const sql = postgres(auditDbUrl, { max: 5 })

// No `schema` is passed: we use the core query builder (insert/select against
// imported tables), not the relational `db.query.*` API, so the schema option
// would be dead weight.
export const auditDb = drizzle({ client: sql })

// Retention-role connection (M4 — ADR-0027). Owns the ONLY controlled bypass
// of the ADR-0013 append-only trigger: DELETE + UPDATE of `s3_archived_at`.
// Lazy-imported by the retention purge job; the warm hot path never sees it.
// Lazily constructed so this module doesn't open a second pool at import time
// (the purge job runs on a cron, not per request).
let _retentionDb: ReturnType<typeof drizzle> | undefined
let _retentionSql: ReturnType<typeof postgres> | undefined
export function getAuditRetentionDb(): ReturnType<typeof drizzle> {
  if (_retentionDb) return _retentionDb
  const url =
    process.env.AUDIT_RETENTION_DB_URL ??
    'postgres://audit_retention:audit_retention@localhost:5432/audit'
  _retentionSql = postgres(url, { max: 2 })
  _retentionDb = drizzle({ client: _retentionSql })
  return _retentionDb
}
