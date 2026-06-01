-- First-boot init for the shared platform Postgres instance — `audit` DB.
-- docs/architecture.md §14; ADR-0041 (audit + access governance: IHE ATNA from
-- the BFF → this Postgres `audit` schema); ADR-0013 (append-only).
--
-- Runs once, as the instance superuser (POSTGRES_USER=keycloak), against the
-- default `keycloak` database. Creates the app-owned `audit` database and two
-- least-privilege roles:
--
--   audit_owner   — owns the schema, runs drizzle-kit migrations. Never used by
--                   the running app.
--   audit_writer  — the app runtime identity. INSERT + SELECT only; UPDATE and
--                   DELETE are never granted (append-only at the grant layer,
--                   reinforced by a BEFORE UPDATE OR DELETE trigger added in the
--                   first migration). The IHE ATNA access trail is immutable.
--
-- The `audit_retention` role + the tamper-evidence hash chain are DEFERRED
-- hardening (ADR-0041 / CLAUDE.md "Deferred (post-core)") — they return with the
-- retention/purge + cold-store work, not in M7.
--
-- Dev-only passwords (dev-only-rotate-in-prod). Production injects real
-- credentials via AUDIT_DB_URL / AUDIT_DB_OWNER_URL and may point them at a
-- physically separate managed Postgres.

CREATE ROLE audit_owner WITH LOGIN PASSWORD 'audit_owner';
CREATE ROLE audit_writer WITH LOGIN PASSWORD 'audit_writer';

CREATE DATABASE audit OWNER audit_owner;

\connect audit

-- Lock down the public schema: no implicit access for PUBLIC.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO audit_owner;
GRANT USAGE, CREATE ON SCHEMA public TO audit_owner;
GRANT USAGE ON SCHEMA public TO audit_writer;

-- Tables created later by audit_owner (via migrations) grant the writer exactly
-- INSERT + SELECT — never UPDATE or DELETE.
ALTER DEFAULT PRIVILEGES FOR ROLE audit_owner IN SCHEMA public
  GRANT INSERT, SELECT ON TABLES TO audit_writer;
ALTER DEFAULT PRIVILEGES FOR ROLE audit_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO audit_writer;

-- drizzle-kit's migration bookkeeping lives in its own schema; let the owner
-- manage it.
GRANT CREATE ON DATABASE audit TO audit_owner;
