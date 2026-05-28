-- First-boot init for the shared platform Postgres instance — `auth` DB.
-- docs/architecture.md §5; ADR-0028 (Better Auth migration), ADR-0029 (auth DB
-- topology).
--
-- Runs once, as the instance superuser (POSTGRES_USER=keycloak), against the
-- default `keycloak` database. Creates the app-owned `auth` database and two
-- least-privilege roles:
--
--   auth_owner   — owns the schema, runs drizzle-kit migrations. Never used
--                  by the running app.
--   auth_writer  — the app runtime identity. Better Auth needs INSERT +
--                  SELECT + UPDATE + DELETE on its own tables (unlike audit,
--                  this is a CRUD store: sessions expire, users get banned,
--                  org members join/leave). The append-only discipline of
--                  ADR-0013 does NOT apply here — the audit log (NEN 7513)
--                  remains the immutable accountability layer.
--
-- Dev-only passwords (dev-only-rotate-in-prod). Production injects real
-- credentials via AUTH_DB_URL / AUTH_DB_OWNER_URL and may point them at a
-- physically separate managed Postgres.

CREATE ROLE auth_owner WITH LOGIN PASSWORD 'auth_owner';
CREATE ROLE auth_writer WITH LOGIN PASSWORD 'auth_writer';

CREATE DATABASE auth OWNER auth_owner;

\connect auth

-- Lock down the public schema: no implicit access for PUBLIC.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO auth_owner;
GRANT USAGE, CREATE ON SCHEMA public TO auth_owner;
GRANT USAGE ON SCHEMA public TO auth_writer;

-- Tables created later by auth_owner (via migrations) grant the writer full
-- CRUD privileges — required by Better Auth's session/user/account lifecycle.
ALTER DEFAULT PRIVILEGES FOR ROLE auth_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO auth_writer;
ALTER DEFAULT PRIVILEGES FOR ROLE auth_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO auth_writer;

-- drizzle-kit's migration bookkeeping lives in its own schema; let the owner
-- manage it.
GRANT CREATE ON DATABASE auth TO auth_owner;
