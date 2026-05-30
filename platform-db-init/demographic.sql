-- First-boot init for the shared platform Postgres instance — `demographic` DB.
-- docs/architecture.md §M7; ADR-0031 (pluggable demographic provider — the
-- built-in Postgres adapter is the default).
--
-- Runs once, as the instance superuser (POSTGRES_USER=keycloak), against the
-- default `keycloak` database. Creates the app-owned `demographic` database and
-- two least-privilege roles:
--
--   demographic_owner   — owns the schema, runs drizzle-kit migrations. Never
--                         used by the running app.
--   demographic_writer  — the app runtime identity. Full CRUD on its own tables
--                         only (no DDL). Unlike `audit` (append-only, ADR-0013),
--                         this is a CRUD store: VERSIONED_PARTY semantics insert
--                         version snapshots, update the current row, and rebuild
--                         the extracted index tables. The NEN-7513 audit log
--                         remains the immutable accountability layer — every
--                         PARTY op is audited there (rule 1; source.adapterName).
--
-- Dev-only passwords (dev-only-rotate-in-prod). Production injects real
-- credentials via DEMOGRAPHIC_DB_URL / DEMOGRAPHIC_DB_OWNER_URL and may point
-- them at a physically separate managed Postgres.

CREATE ROLE demographic_owner WITH LOGIN PASSWORD 'demographic_owner';
CREATE ROLE demographic_writer WITH LOGIN PASSWORD 'demographic_writer';

CREATE DATABASE demographic OWNER demographic_owner;

\connect demographic

-- Lock down the public schema: no implicit access for PUBLIC.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO demographic_owner;
GRANT USAGE, CREATE ON SCHEMA public TO demographic_owner;
GRANT USAGE ON SCHEMA public TO demographic_writer;

-- Tables created later by demographic_owner (via migrations) grant the writer
-- full CRUD — required by the VERSIONED_PARTY write path.
ALTER DEFAULT PRIVILEGES FOR ROLE demographic_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO demographic_writer;
ALTER DEFAULT PRIVILEGES FOR ROLE demographic_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO demographic_writer;

-- drizzle-kit's migration bookkeeping lives in its own schema; let the owner
-- manage it.
GRANT CREATE ON DATABASE demographic TO demographic_owner;
