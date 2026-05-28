// postgres.js + Drizzle connection to the app-owned `auth` database
// (docs/architecture.md §5; ADR-0028, ADR-0029).
//
// Runtime uses AUTH_DB_URL, which carries the least-privilege `auth_writer`
// identity (full CRUD on Better Auth tables only — no DDL). AUTH_DB_URL is a
// standalone env var so a production deployment can target a physically
// separate managed Postgres without any code change.

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

// Import-safe: no throw at module load. postgres.js connects lazily on the
// first query, so an unset/unreachable DB only surfaces when an auth call is
// actually attempted. The default matches .env.example.
const authDbUrl =
  process.env.AUTH_DB_URL ??
  'postgres://auth_writer:auth_writer@localhost:5432/auth'

// One pooled connection per process. Better Auth issues many short queries
// (session reads on every authed request); a slightly larger pool than the
// audit writer keeps the hot path from serialising.
const sql = postgres(authDbUrl, { max: 10 })

// No `schema` passed — same pattern as src/db/client.server.ts. The
// drizzleAdapter in Better Auth introspects the table objects directly via
// the schema export from src/db/schema/auth.ts.
export const authDb = drizzle({ client: sql })
