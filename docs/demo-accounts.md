# Demo accounts (development only)

> **Development credentials. Never in production.** The realm baseline (`keycloak/config/ehrbase-realm.json`) carries NO users — it is the prod-safe baseline. The four identities below live in a separate dev-only file (`keycloak/config/ehrbase-users.dev.json`) applied by the `keycloak-config` one-shot container (keycloak-config-cli). Production points `IMPORT_FILES_LOCATIONS` at the realm file only and never sees these credentials (ADR-0036). Architecture-doc references: [`§5.4`](architecture.md#54-authorization-code--pkce-flow), [`§5.6`](architecture.md#56-roles-authorization--break-glass-emergency-access), [ADR-0028](adr/0028-better-auth-migration.md), [ADR-0036](adr/0036-keycloak-config-as-code.md).

> **Auth pipeline note (ADR-0028).** The credentials below live in **Keycloak**; the login flow itself routes through **Better Auth** as the OIDC client of Keycloak (SSO plugin). On first sign-in Better Auth JIT-provisions a row in its own `user` table (auth DB, ADR-0029) and mirrors the Keycloak `realm_access.roles` claim into the `keycloakRoles` JSONB column — that's what `requireRole(['clinician'])` reads server-side. Keycloak remains the source of truth for passwords, MFA, brute-force protection, and the realm-role set.

## What you get

Four pre-seeded users, one per realm role from [`keycloak/config/ehrbase-realm.json`](../keycloak/config/ehrbase-realm.json) (the same roles RBAC checks in [`apps/web/src/server/auth/require-role.ts`](../apps/web/src/server/auth/require-role.ts)).

| Username             | Email                             | Password            | Realm role       | What this account can do                                                                                                                                                                                                                          |
| -------------------- | --------------------------------- | ------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dev-clinician`      | `dev-clinician@example.test`      | `DevClinician123!`  | `clinician`      | Read PHI for patients in their care relationship; write compositions; run AQL scoped to those patients (§5.6).                                                                                                                                    |
| `dev-admin`          | `dev-admin@example.test`          | `DevAdmin12345!`    | `admin`          | Manage templates, users, roles, configuration. Cannot read PHI without break-glass.                                                                                                                                                               |
| `dev-audit-reviewer` | `dev-audit-reviewer@example.test` | `DevReviewer123!`   | `audit-reviewer` | Recognised by RBAC (`requireRole(['audit-reviewer'])`). The audit-review surface (access log, NEN 7513 review dashboard) is part of the deferred governance layer — **not built yet** (see [`CLAUDE.md`](../CLAUDE.md) → "Deferred (post-core)"). |
| `dev-researcher`     | `dev-researcher@example.test`     | `DevResearcher123!` | `researcher`     | Recognised by RBAC. Intended for research AQL against a pseudonymised dataset; the pseudonymised-dataset gating is part of the deferred governance layer (post-core).                                                                             |

Login works with either the **username** OR the **email** (the realm has `loginWithEmailAllowed: true`).

> The "what this account can do" column describes the **target** per-role capabilities. While the build is engine-first, all four accounts sign in through the same OIDC flow and land on the [Workbench](architecture.md); the role-scoped PHI surfaces and the governance-gated capabilities (audit review, pseudonymised research dataset) are still being built.

The passwords satisfy the realm policy ([`passwordPolicy` in `keycloak/config/ehrbase-realm.json`](../keycloak/config/ehrbase-realm.json)): length(12) + lowerCase + upperCase + digits + specialChars + notUsername + notEmail + passwordHistory(5).

The Keycloak admin console itself uses `admin` / `admin` (`KC_BOOTSTRAP_ADMIN_USERNAME` / `KC_BOOTSTRAP_ADMIN_PASSWORD` in [`docker-compose.yml`](../docker-compose.yml)). Available at <http://localhost:8180>.

## How the seeding works

A one-shot container — `keycloak-config` (image `adorsys/keycloak-config-cli`) — runs after Keycloak reports healthy and applies the declarative config under [`keycloak/config/`](../keycloak/config/) via the Keycloak Admin API:

1. `ehrbase-realm.json` — the realm + roles + the two OIDC clients (`ehrbase-ui`, `ehrbase`) (idempotent, **updates in place**).
2. `ehrbase-users.dev.json` — the four demo identities above, each with a non-temporary password and its realm role.

It is idempotent and declarative: re-running reconciles the desired state, including updates to an already-existing realm (the capability `--import-realm` lacked). keycloak-config-cli manages only the collections each file defines, so `ehrbase-users.dev.json` (users only) never touches the baseline clients/roles. Realm-dependent services (`ehrbase`, `ui`) gate on `keycloak-config` completing.

## Enabling / disabling

Whether the demo users are applied is controlled by which files `keycloak-config` reads
(`IMPORT_FILES_LOCATIONS`):

| Posture                   | How to set it                                                                        | Result                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| **Development** (default) | The dev compose globs `/config/*.json`, picking up both files.                       | `docker compose up` applies the realm + clients + the four demo users. |
| **Development, opt-out**  | Set `IMPORT_FILES_LOCATIONS=/config/ehrbase-realm.json` on the `keycloak-config` svc | Realm + clients only; no demo identities.                              |
| **Production**            | Point `IMPORT_FILES_LOCATIONS` at the realm file only (the prod compose/override)    | The user file is never applied. The baseline carries no users.         |

## Verifying the seeding ran

After `docker compose up -d --wait` (or `docker compose run --rm keycloak-config` to run it synchronously):

```bash
docker compose logs keycloak-config
# Expect keycloak-config-cli to report the realm imported/updated and the
# users created/updated, then exit 0. Realm: ehrbase.
```

Then browse to <http://localhost:3000/me>, sign in with any of the four credentials above, and the protected layout renders with the role + email visible on the `/me` page.

## Why keep demo users out of the realm baseline?

The realm baseline (`ehrbase-realm.json`) is the same file a production deployment re-uses. Baking dev users with hard-coded plaintext passwords into it would risk creating them in production. By keeping the baseline user-empty and putting demo users in a separate `ehrbase-users.dev.json` that production simply doesn't point at, the prod-vs-dev difference is impossible to mix up — a prod deployment has to opt IN to demo users, not opt OUT.

## Rotation discipline

The dev passwords in this file are **public** — they live in source-controlled docs. If a contributor copies them outside dev (a staging environment, a public demo), they must be rotated and the new values written to the deployment's secret manager. Never use these credentials anywhere data leaving the dev box can touch them.
