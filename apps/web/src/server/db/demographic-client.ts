// postgres.js + Drizzle connection to the app-owned `demographic` database
// (ADR-0031; arch §M7). Injected into the built-in DemographicProvider by the
// provider factory (server/demographic/provider.factory.server.ts).
//
// Runtime uses DEMOGRAPHIC_DB_URL, which carries the least-privilege
// `demographic_writer` identity (full CRUD on the demographic tables only — no
// DDL). Unlike `audit`, this is a CRUD store (VERSIONED_PARTY: insert version
// snapshots, update the current row, rebuild index tables). DEMOGRAPHIC_DB_URL
// is a standalone env var so a production deployment can target a physically
// separate managed Postgres without any code change.

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

// Import-safe (see audit/auth clients): no throw at module load. postgres.js
// connects lazily on the first query. The default matches .env.example.
const demographicDbUrl =
  process.env.DEMOGRAPHIC_DB_URL ??
  'postgres://demographic_writer:demographic_writer@localhost:5432/demographic'

// One pooled connection per process. Demographic reads back the patient banner
// on most authed clinical requests, so size the pool like `auth`, above audit.
const sql = postgres(demographicDbUrl, { max: 10 })

export const demographicDb = drizzle({ client: sql })
