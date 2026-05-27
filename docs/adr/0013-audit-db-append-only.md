# ADR-0013 — Audit DB topology + append-only enforcement

- **Status:** Accepted
- **Date:** 2026-05-27
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

Architecture-doc reference: §14. The `audit` database is the warm-tier source
of truth for NEN 7513 events (ADR-0005). Two questions: where does it live, and
how do we make it tamper-resistant at the storage layer (beyond the §14.5 hash
chain)?

## Decision

**Topology — no new container.** The existing Keycloak Postgres instance is
renamed `keycloak-db → platform-db` (same `postgres:18.4-alpine`, same Keycloak
DB/creds/volume). A first-boot init script (`platform-db-init/audit.sql`) adds
a separate `audit` **database** and two roles inside that instance:

- `audit_owner` — owns the schema, runs migrations. Never used at runtime.
- `audit_writer` — the app runtime identity. **`INSERT` + `SELECT` only.**

`AUDIT_DB_URL` is its own env var, so production can promote the audit DB to a
physically separate managed Postgres with zero code change. Logical isolation +
least privilege now; physical-isolation path kept open.

**Append-only enforcement — two layers.**

1. **Grant layer:** `UPDATE`/`DELETE` are never granted to `audit_writer`
   (default privileges + an explicit `GRANT INSERT, SELECT`).
2. **DB-enforced trigger:** a `BEFORE UPDATE OR DELETE` trigger on
   `audit_events` raises an exception, so even a privilege misconfiguration
   cannot mutate or erase a recorded event.

These sit beneath the §14.5 hash chain, which detects tampering that bypasses
the DB entirely (e.g. raw file edits in a restore scenario).

## Consequences

**Positive:** no extra container to operate; least-privilege runtime; storage
that physically refuses mutation; a clean promotion path to a dedicated
managed Postgres. **Negative:** Keycloak and the audit DB share an instance in
dev (a noisy-neighbor / blast-radius coupling) — accepted for dev, and the
standalone `AUDIT_DB_URL` makes separating them in prod a config change, not a
code change. The rename orphans the old `keycloak_pg` volume on existing dev
machines; handle with `docker compose down -v` (pre-v1, no data to preserve).
