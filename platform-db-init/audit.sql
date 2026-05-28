-- First-boot init for the shared platform Postgres instance.
-- docs/architecture.md §14; ADR-0013 (audit DB append-only).
--
-- Runs once, as the instance superuser (POSTGRES_USER=keycloak), against the
-- default `keycloak` database. Creates the app-owned `audit` database and two
-- least-privilege roles:
--
--   audit_owner      — owns the schema, runs drizzle-kit migrations. Never
--                      used by the running app.
--   audit_writer     — the app runtime identity. INSERT + SELECT only; UPDATE
--                      and DELETE are never granted (append-only at the grant
--                      layer, reinforced by a BEFORE UPDATE OR DELETE trigger
--                      added in the first migration).
--   audit_retention  — M4 retention-job identity (ADR-0027). The ONE role
--                      granted DELETE on audit_events plus UPDATE of the
--                      s3_archived_at bookkeeping column. The append-only
--                      trigger has a narrow exception for this role only;
--                      every other column stays immutable.
--
-- Dev-only passwords (dev-only-rotate-in-prod). Production injects real
-- credentials via AUDIT_DB_URL / AUDIT_DB_OWNER_URL / AUDIT_RETENTION_DB_URL
-- and may point them at a physically separate managed Postgres.

CREATE ROLE audit_owner WITH LOGIN PASSWORD 'audit_owner';
CREATE ROLE audit_writer WITH LOGIN PASSWORD 'audit_writer';
CREATE ROLE audit_retention WITH LOGIN PASSWORD 'audit_retention';

CREATE DATABASE audit OWNER audit_owner;

\connect audit

-- Lock down the public schema: no implicit access for PUBLIC.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO audit_owner;
GRANT USAGE, CREATE ON SCHEMA public TO audit_owner;
GRANT USAGE ON SCHEMA public TO audit_writer;
GRANT USAGE ON SCHEMA public TO audit_retention;

-- Tables created later by audit_owner (via migrations) grant the writer
-- exactly INSERT + SELECT — never UPDATE or DELETE.
ALTER DEFAULT PRIVILEGES FOR ROLE audit_owner IN SCHEMA public
  GRANT INSERT, SELECT ON TABLES TO audit_writer;
ALTER DEFAULT PRIVILEGES FOR ROLE audit_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO audit_writer;

-- drizzle-kit's migration bookkeeping lives in its own schema; let the owner
-- manage it.
GRANT CREATE ON DATABASE audit TO audit_owner;
