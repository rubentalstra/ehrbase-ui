# Demo accounts (development only)

> **Development credentials. Never in production.** The realm import file (`keycloak/import/ehrbase.json`) carries NO users — it is the prod-safe baseline. The four identities below are seeded post-startup by a one-shot init container gated by the `demo` Compose profile. Production omits the profile and never sees these credentials. Architecture-doc references: [`§5.4`](architecture.md#54-authorization-code--pkce-flow), [`§5.6`](architecture.md#56-roles-authorization--break-glass-emergency-access), [ADR-0028](adr/0028-better-auth-migration.md).

> **Auth pipeline note (ADR-0028).** The credentials below live in **Keycloak**; the login flow itself routes through **Better Auth** as the OIDC client of Keycloak (SSO plugin). On first sign-in Better Auth JIT-provisions a row in its own `user` table (auth DB, ADR-0029) and mirrors the Keycloak `realm_access.roles` claim into the `keycloakRoles` JSONB column — that's what `requireRole(['clinician'])` reads server-side. Keycloak remains the source of truth for passwords, MFA, brute-force protection, and the realm-role set.

## What you get

Four pre-seeded users, one per realm role from [`keycloak/import/ehrbase.json`](../keycloak/import/ehrbase.json) (the same roles RBAC checks in [`src/lib/auth/require-role.server.ts`](../src/lib/auth/require-role.server.ts)).

| Username             | Email                             | Password            | Realm role       | What this account can do                                                                                                                                          |
| -------------------- | --------------------------------- | ------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dev-clinician`      | `dev-clinician@example.test`      | `DevClinician123!`  | `clinician`      | Read PHI for patients in their care relationship; write compositions; run AQL scoped to those patients (§5.6).                                                    |
| `dev-admin`          | `dev-admin@example.test`          | `DevAdmin12345!`    | `admin`          | Manage templates, users, roles, configuration. Cannot read PHI without break-glass.                                                                               |
| `dev-audit-reviewer` | `dev-audit-reviewer@example.test` | `DevReviewer123!`   | `audit-reviewer` | Read the audit log; run the NEN 7513 sample-of-60 review dashboard (§14.13). Also the role allowed to trigger the M4 audit tasks at `/api/admin/audit/tasks/...`. |
| `dev-researcher`     | `dev-researcher@example.test`     | `DevResearcher123!` | `researcher`     | Read pseudonymised PHI; full AQL access against the pseudonymised dataset. Cannot read identifying fields.                                                        |

Login works with either the **username** OR the **email** (the realm has `loginWithEmailAllowed: true`).

The passwords satisfy the realm policy ([`passwordPolicy` in `keycloak/import/ehrbase.json`](../keycloak/import/ehrbase.json)): length(12) + lowerCase + upperCase + digits + specialChars + notUsername + notEmail + passwordHistory(5).

The Keycloak admin console itself uses `admin` / `admin` (`KC_BOOTSTRAP_ADMIN_USERNAME` / `KC_BOOTSTRAP_ADMIN_PASSWORD` in [`docker-compose.yml`](../docker-compose.yml)). Available at <http://localhost:8180>.

## How the seeding works

A one-shot init container — `keycloak-seed-demo-users` — runs after Keycloak reports healthy. It uses `kcadm.sh` (bundled in the official Keycloak image) to:

1. Authenticate as the bootstrap admin against the realm.
2. For each of the four identities above:
   - Skip if `kcadm.sh get users -q username=...` already returns a row (idempotent across re-runs).
   - Otherwise: create the user, set the password (non-temporary so login doesn't force a reset), assign the realm role.

The script is at [`keycloak/scripts/seed-demo-users.sh`](../keycloak/scripts/seed-demo-users.sh).

## Enabling / disabling

Gated by the `demo` Docker Compose profile (`profiles: ['demo']` on the `keycloak-seed-demo-users` service). Services WITHOUT a profile always start; services WITH a profile only start when that profile is active. So the default is **opt-in**, controlled by the `COMPOSE_PROFILES` environment variable.

| Posture                   | How to set it                                                                                     | Result                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Development** (default) | `.env.local` (or `.env`) contains `COMPOSE_PROFILES=demo` — see [`.env.example`](../.env.example) | `docker compose up` starts the seeder; the four users are created in the realm.                     |
| **Development, opt-out**  | `COMPOSE_PROFILES=` (empty) for one command, OR `docker compose up` without the env               | Seeder does not start. No demo identities. `docker compose --profile demo up` re-enables.           |
| **Production**            | Do not export `COMPOSE_PROFILES=demo` in any environment file used by the prod orchestrator       | Seeder service is invisible to Compose. Even if the file is somehow pulled in, no profile = no run. |

Per-command override:

```bash
# Dev — explicit (no .env reliance):
docker compose --profile demo up -d --wait

# Prod — explicit (refuses to start the seeder even if .env has the profile):
COMPOSE_PROFILES= docker compose up -d --wait
```

## Verifying the seeding ran

After `docker compose --profile demo up -d --wait` (or `.env`-driven `docker compose up -d --wait`):

```bash
docker compose logs keycloak-seed-demo-users
# Expected:
# [seed] authenticating as admin against http://keycloak:8080
# [seed] dev-clinician created (role=clinician, email=dev-clinician@example.test)
# [seed] dev-admin created (role=admin, email=dev-admin@example.test)
# [seed] dev-audit-reviewer created (role=audit-reviewer, email=dev-audit-reviewer@example.test)
# [seed] dev-researcher created (role=researcher, email=dev-researcher@example.test)
# [seed] done — 4 demo users present in realm ehrbase
```

Then browse to <http://localhost:3000/me>, sign in with any of the four credentials above, and the protected layout renders with the role + email visible on the `/me` page. The `LOGIN` audit event (tagged `retentionPolicy: 'AUTH_LOG'`, per M4) lands in `audit_events`. Visit `/me/access-log` to see the row.

## Why not bake demo users into the realm-import JSON?

We did until M4 (PR #16). The problem: the same realm file is the one a production deployment would re-use, and Keycloak's `--import-realm` happily creates production users with hard-coded plaintext dev passwords. By keeping the import file user-empty and seeding via a profile-gated init container, the prod-vs-dev difference is impossible to mix up — a prod deployment has to opt IN, not opt OUT.

## Rotation discipline

The dev passwords in this file are **public** — they live in source-controlled docs. If a contributor copies them outside dev (a staging environment, a public demo), they must be rotated and the new values written to the deployment's secret manager. Never use these credentials anywhere data leaving the dev box can touch them.
