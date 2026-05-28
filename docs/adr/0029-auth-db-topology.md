# ADR-0029 — Auth DB topology + least-privilege roles

- **Status:** Accepted
- **Date:** 2026-05-28
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

Architecture-doc reference: §5; ADR-0028 (Better Auth migration). Better Auth's Drizzle adapter needs a Postgres database to host `user` / `session` / `account` / `verification` plus plugin tables (`organization`, `member`, `invitation`, `team`, `team_member`, `sso_provider`). Two questions: where does this database live, and how do we keep it least-privilege without inheriting the strict append-only model of the `audit` DB (ADR-0013) — sessions need to UPDATE / DELETE / expire, users get banned, org members join + leave.

## Decision

**Add a new `auth` database alongside the existing `audit` DB on the shared platform-db Postgres instance.** Two least-privilege roles, matching the ADR-0013 pattern but with CRUD privileges instead of append-only:

- `auth_owner` — owns the `public` schema in the `auth` DB, runs `drizzle-kit` migrations. Never used at runtime.
- `auth_writer` — the app runtime identity. **`SELECT + INSERT + UPDATE + DELETE`** on every Better-Auth-owned table.

The append-only discipline of ADR-0013 does NOT apply here — the audit log (NEN 7513) is and remains the immutable accountability layer; the auth DB is by design a mutable CRUD store (a session expires; a user is unbanned; a team gets renamed).

Init script: [`platform-db-init/auth.sql`](../../platform-db-init/auth.sql) (runs on first boot, as the instance superuser).

`AUTH_DB_URL` (writer) and `AUTH_DB_OWNER_URL` (migration) are standalone env vars so production can promote the auth DB to a physically separate managed Postgres without code change — the same logical-isolation-now / physical-promotion path the `audit` DB exposed in ADR-0013.

Migrations live under [`src/db/migrations-auth/`](../../src/db/migrations-auth/) (separate from `src/db/migrations/` which the audit DB uses). The drizzle-kit config that drives them is [`drizzle.auth.config.ts`](../../drizzle.auth.config.ts), invoked via `pnpm db:auth:generate` + `pnpm db:auth:migrate`.

## Consequences

**Positive.** Same physical platform-db host as the audit + Keycloak DBs in dev (no extra container); same separation discipline as ADR-0013 (owner-vs-writer + standalone URL for prod promotion); separate Drizzle config + migrations directory keeps the audit DB's append-only migrations from accidentally getting CRUD permissions or vice versa.

**Negative.** Three databases on a single Postgres instance in dev (keycloak + audit + auth) is more contention on a single connection pool. Accepted — production runs separate managed instances anyway, gated by env vars.

**Trade-off vs reusing the `audit` DB.** The `audit` DB is append-only with a DB-enforced trigger (ADR-0013). Putting mutable Better Auth tables in there would require either dropping the trigger (breaks ADR-0013) OR carving out a separate schema with different ownership (more configuration than running a separate database). A separate DB is cleaner.

**Trade-off vs a separate Postgres container.** Strongest isolation; in dev compose this means a fourth container, a fourth set of credentials, a fourth backup story. For now, single-instance + per-DB roles. The promotion path to separate instances is by env var only — no code change.

## Verification

- `docker compose --profile demo up -d --wait` brings up platform-db with three DBs (`keycloak`, `audit`, `auth`) and three role pairs.
- `pnpm db:auth:migrate` applies the Better Auth schema as `auth_owner`; the runtime then connects as `auth_writer` and a `SELECT count(*) FROM user` works; an attempted `CREATE TABLE` from the runtime role fails.
- After a sign-in, `SELECT id, email, "keycloakRoles" FROM "user"` shows the JIT-provisioned row with the Keycloak realm roles mirrored.
