# ADR-0036 — Keycloak configuration-as-code via keycloak-config-cli

- **Status:** Accepted
- **Date:** 2026-05-29
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** the `--import-realm` + bespoke `kcadm` shell-script approach (M1–M5 dev stack).
- **Superseded by:** —

## Context

Architecture-doc reference: §5 (auth), §18 (Docker).

The dev stack configured Keycloak with three moving parts:

1. `keycloak start-dev --import-realm` against `keycloak/import/ehrbase.json`.
2. `keycloak/scripts/sync-grafana-client.sh` — a one-shot container that re-applied the `grafana`
   OIDC client on every up, because **`--import-realm` uses strategy `IGNORE_EXISTING` and silently
   skips a realm that already exists** — so any client added after first boot would never appear.
3. `keycloak/scripts/seed-demo-users.sh` — a one-shot `kcadm.sh` container that seeded four demo users.

This had two problems. First, the `grafana` client was defined in **two places** (the realm JSON and
the sync script) with a "keep them in sync" comment — a maintenance hazard. Second, the bespoke shell
scripts are exactly the kind of hand-rolled glue that drifts and is hard to review; `--import-realm`
fundamentally cannot _update_ an existing realm, only create-or-recreate it.

The de-facto-standard tool for declarative, idempotent Keycloak configuration is
[`keycloak-config-cli`](https://github.com/adorsys/keycloak-config-cli) (adorsys). It consumes
Keycloak's own realm-export JSON format, applies it via the Admin API, and **updates realms + clients
in place**. It manages only the collections each file _defines_ (omit `clients` → clients untouched),
and users are upserted (not full-managed). Variable substitution (`$(env:VAR)`) injects secrets.

## Decision

**Replace all three mechanisms with one `keycloak-config-cli` one-shot container** driving declarative
config under `keycloak/config/`:

- `keycloak/config/ehrbase-realm.json` — realm + roles + all three OIDC clients (`ehrbase-ui`,
  `ehrbase`, **`grafana`** — single source of truth). Client secrets via `$(env:KEYCLOAK_CLIENT_SECRET)`
  / `$(env:GRAFANA_OIDC_CLIENT_SECRET)`.
- `keycloak/config/ehrbase-users.dev.json` — the four demo users (dev only; omits `clients`/`roles` so it
  never touches the baseline). **Production** points `IMPORT_FILES_LOCATIONS` at `ehrbase-realm.json`
  only, so the prod baseline carries no users — same guarantee the old `SEED_DEMO_USERS=skip` gave.

The `keycloak` service drops `--import-realm` (now plain `start-dev`) and its import volume.

**Ordering change:** with `--import-realm` the realm existed before Keycloak reported healthy. Now the
realm is applied _after_ Keycloak is healthy (by keycloak-config), so realm-dependent services —
`ehrbase` (builds its JwtDecoder from OIDC discovery at startup), `ui` (Better Auth SSO discovery), and
`grafana` (OIDC client) — gate on `keycloak-config: service_completed_successfully`, not on Keycloak's
healthcheck.

Image pinned to `adorsys/keycloak-config-cli:6.5.1-26.5.5` (the 26.x-line build; no 26.6.x tag is
published, and the Keycloak 26 Admin API is stable across minors, so it is compatible with our pinned
`keycloak:26.6.2`). Never `:latest` (Inviolable rule 5).

Files deleted: `keycloak/import/ehrbase.json`, `keycloak/scripts/sync-grafana-client.sh`,
`keycloak/scripts/seed-demo-users.sh`. One-shot containers drop from 4 to 3 (`db-migrate`,
`keycloak-config`, `seaweedfs-init`).

## Consequences

- **Positive:** one declarative source of truth; realm/client changes apply on `up` without a volume
  reset; no bespoke shell scripts; the grafana-client duplication is gone.
- **Negative:** adds one third-party image to the supply chain (pinned, age-gated by pnpm policy at the
  app layer is N/A for images, but the tag is exact); the cli-vs-keycloak version pairing must be
  bumped together when Keycloak upgrades.
- **Neutral:** demo-user credentials are unchanged (docs/demo-accounts.md); CI applies config
  synchronously via `docker compose run --rm keycloak-config`.
