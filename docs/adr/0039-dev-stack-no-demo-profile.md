# ADR-0039 — Dev stack has no `demo` compose profile; demo users gated by keycloak-config

- **Status:** Accepted
- **Date:** 2026-05-31
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** the operational `docker compose --profile demo up` commands and the platform-db DB list in [ADR-0028](0028-better-auth-migration.md) and [ADR-0029](0029-auth-db-topology.md). Those ADRs remain accepted for their auth/DB decisions; only their **bring-up commands and DB enumeration** are restated here.
- **Superseded by:** —

## Context

Architecture-doc reference: §5 (auth), §18 (Docker). Related: [ADR-0036](0036-keycloak-config-as-code.md) (Keycloak config-as-code), the 2026-05-30 core-refocus (CLAUDE.md → "Deferred (post-core)").

Two pieces of operational drift accumulated in earlier ADRs and docs:

1. **The `demo` compose profile no longer exists.** ADR-0028 and ADR-0029 documented bring-up as
   `docker compose --profile demo up -d --wait`. Since [ADR-0036](0036-keycloak-config-as-code.md)
   moved Keycloak to declarative config-as-code, whether the four demo users are seeded is decided by
   **which files `keycloak-config` reads** (`IMPORT_FILES_LOCATIONS`), not by a compose profile. The
   only profiles in `docker-compose.yml` today are `terminology` (HAPI FHIR tx server) and `snomed`
   (self-hosted Snowstorm + Elasticsearch) — both optional add-ons, neither related to demo data.

2. **The platform-db DB list changed.** ADR-0029 enumerated "three DBs (`keycloak`, `audit`, `auth`)".
   The **`audit` DB was removed in the core-refocus** (the NEN-7513 audit subsystem is deferred
   post-core). A separate **`demographic` DB** was added (ADR-0031). The `audit` DB returns when the
   audit layer does.

3. **The `grafana` OIDC client was removed.** [ADR-0036](0036-keycloak-config-as-code.md) listed three
   realm clients (`ehrbase-ui`, `ehrbase`, `grafana`). Grafana was part of the OTel/observability stack
   removed in the core-refocus, so the dead `grafana` client and its `GRAFANA_OIDC_CLIENT_SECRET`
   plumbing were dropped from `keycloak/config/ehrbase-realm.json` and `docker-compose.yml`.

## Decision

**The dev stack is brought up with a plain `docker compose up -d --wait`** — no `demo` profile. The
canonical local workflow is:

```bash
pnpm install
cp .env.example .env.local
docker compose up -d --wait    # core stack: EHRbase + Keycloak (+ config) + Valkey + platform-db
pnpm dev
```

- **Demo users (dev default).** The dev compose globs `IMPORT_FILES_LOCATIONS: '/config/*.json'`, so
  `keycloak-config` applies both `ehrbase-realm.json` (realm + roles + the **two** OIDC clients
  `ehrbase-ui`, `ehrbase`) and `ehrbase-users.dev.json` (the four demo identities). See
  [docs/demo-accounts.md](../demo-accounts.md).
- **Prod-like (no demo users).** Point `IMPORT_FILES_LOCATIONS` at `ehrbase-realm.json` only. The realm
  baseline carries no users, so production never sees demo credentials. This replaces the old
  `--profile demo` opt-in / `SEED_DEMO_USERS=skip` opt-out.
- **platform-db hosts three databases:** `keycloak` (Keycloak's own), `auth` (`auth_owner` /
  `auth_writer` — ADR-0029) and `demographic` (`demographic_owner` / `demographic_writer` — ADR-0031),
  each created by `platform-db-init/*.sql`. There is **no `audit` DB** until the audit layer is
  restored post-core.
- **Optional service profiles:** `docker compose --profile terminology up` (HAPI FHIR terminology
  server) and `docker compose --profile snomed up` (Snowstorm). Neither is needed for the core workflow.

## Consequences

- **Positive:** the documented bring-up command matches reality; one obvious default (`docker compose
up`) with demo users, one explicit override for prod-like. No phantom `demo` profile to chase. The
  dead Grafana client/secret no longer confuse the realm config.
- **Negative:** none material — this records reality rather than changing behaviour. Readers of the
  superseded commands in ADR-0028/0029 must follow the supersession link here.
- **Neutral:** when the audit layer is restored post-core, the `audit` DB + its role pair return to
  `platform-db-init` and this ADR's DB enumeration is updated (or superseded) accordingly.
