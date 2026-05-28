# ADR-0028 — Auth foundation: Better Auth + SSO/Admin/Organization plugins (replaces M2 Arctic stack)

- **Status:** Accepted
- **Date:** 2026-05-28
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** Parts of [ADR-0002](0002-bff-pattern.md) (BFF) — session-store mechanics + token exchange — and the M2 Arctic+Valkey-session machinery in `architecture.md §5`.
- **Superseded by:** —

## Context

M2 shipped Arctic + a hand-rolled Valkey session store + per-endpoint OIDC routes (`/api/auth/login`, `/callback`, `/logout`) talking to Keycloak. It works but it is OUR code path for every primitive: refresh handling, session sliding, cookie attributes, CSRF on auth callbacks, user-row materialisation. As M4+ adds user / org / admin / impersonation features, more of the auth surface area lands on us when a mature, plugin-extensible library exists.

User decision (M4 PR-B planning round 2): adopt **Better Auth** as the auth foundation. Keycloak stays as the IdP (mature password policy, MFA, brute-force, admin console — none of which we want to rebuild); Better Auth becomes the OIDC client of Keycloak and the owner of our user / session / account / org tables.

Options considered:

- **Stay on Arctic.** Lowest churn, but every org/admin/team feature we add (M15 admin UI, multi-hospital org model) is new bespoke code on the session store.
- **Lucia v3.** Sessions library, but archived — explicitly discouraged. Not viable.
- **NextAuth / Auth.js.** Mature, but tightly coupled to Next.js conventions. The TanStack Start adapter story is thin compared to Better Auth's first-class TanStack Start integration.
- **Better Auth + plugins.** First-class TanStack Start integration (`better-auth/tanstack-start`), Drizzle adapter, an SSO plugin that fits Keycloak via OIDC discovery, an admin plugin for user moderation + impersonation, an organization plugin (with teams sub-feature) for multi-hospital tenancy.

## Decision

**Replace the Arctic + Valkey-session auth core with Better Auth (v1.6.11), Drizzle-adapter-backed by a new `auth` Postgres database (parallel to the `audit` DB, ADR-0013 pattern — see ADR-0029).**

**Plugin lineup (v1.0):**

| Plugin                              | Source                       | Purpose                                                                                                                                                                                                             |
| ----------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin`                             | `better-auth/plugins`        | User moderation (ban / unban / impersonate / revoke sessions). Adds `role`, `banned`, `banReason`, `banExpires` to `user`; `impersonatedBy` to `session`. Powers the M15 audit-review + admin UI.                   |
| `organization` (with `teams: true`) | `better-auth/plugins`        | Per-hospital tenancy + per-department teams. Adds `organization`, `member`, `invitation`, `team`, `teamMember` tables + `activeOrganizationId` on `session`.                                                        |
| `sso`                               | `@better-auth/sso`           | OIDC client to Keycloak. Discovery-driven config; JIT user provisioning; claim mapping for `realm_access.roles`. Per-org provider linking is wired but unused until M-future when a deployment adds a second realm. |
| `tanstackStartCookies`              | `better-auth/tanstack-start` | Cookie setting + reading inside server functions. **MUST be last in the plugins array** per the Better Auth docs.                                                                                                   |

**Plugins explicitly NOT used in v1.0** (deferred to v1.x):

- **SCIM** — IdP-driven user provisioning (Workday/Okta/Entra → ehrbase-ui). Useful for large hospital IT departments; defer until a deployment asks for it.
- **`oauth-provider`** (the modern OAuth 2.1 IdP plugin, replaces the deprecated `oidc-provider`). This would make ehrbase-ui an IdP serving OTHER apps — the opposite direction. Defer until v1.x ships the patient-portal SDK or a third-party app exchange.

**Keycloak's role.** Unchanged from M2: Keycloak holds the realm, the password policy (length 12 + complexity + `passwordHistory(5)`), the brute-force protection, the MFA configuration, the password-reset flows, the admin console (`/admin`), and the four realm roles (`clinician` / `admin` / `audit-reviewer` / `researcher`). Better Auth reads access / refresh / id tokens from Keycloak's OIDC token endpoint and stores them in `account` rows; the BFF EHRbase proxy still forwards the Keycloak access token to EHRbase as `Authorization: Bearer …`.

**Role-data flow.** Keycloak `realm_access.roles` → Better Auth's SSO `provisionUser` callback (runs on every login per `provisionUserOnEveryLogin: true`) → JSONB column `keycloakRoles` on the `user` row. `requireRole(['clinician'])` reads `auth.user.roles` (server-side projection of the JSONB column) — same call-site contract as M2, different storage. The admin plugin's `role` column is a parallel concept (instance-level admin vs hospital-level), gating Better Auth's own admin endpoints — not used by clinical RBAC.

**Demo accounts.** Unchanged shape: 4 Keycloak users in the realm, gated by the `demo` Compose profile. Better Auth JIT-provisions Better-Auth-side `user` rows on first SSO login; the `keycloakRoles` column gets populated on the same call. See [`docs/demo-accounts.md`](../demo-accounts.md).

**Session timeouts.** Mirror the §5.10 values: `expiresIn: 43200` (12h absolute), `updateAge: 900` (15-min idle). The `cookieCache` lives for 5 minutes so the SSR hot path doesn't round-trip to the DB on every request — DB read still happens after each cache-window slip.

**NEN 7513 audit (§14).** LOGIN / LOGOUT events are emitted from a `hooks.after` middleware on the Better Auth instance — `createAuthMiddleware(async ctx => { if path === '/sso/callback/...' → logAudit({action: 'LOGIN', …}) })`. SESSION_EXPIRED is emitted from `resolveAuth()` when Better Auth returns no session and our cookie was present. The audit chain is untouched.

**Break-glass.** Unchanged in spirit. The grant + counter still live in Valkey (`breakglass:<token>` + `breakglass:count:<token>`, keyed by the Better Auth session token). Forced-logout on ceiling hit calls `auth.api.revokeUserSessions({ body: { userId } })` instead of the M2 `destroySession()`.

## Consequences

**Positive.** We delete ~600 LOC of bespoke auth code (Arctic provider, Valkey session module, per-endpoint OIDC routes, hand-rolled refresh helper, hand-rolled cookie module). We get user moderation + impersonation + per-org tenancy + teams for free, and the admin/org plugins layer naturally on top of the SSO plugin. Sessions land in Postgres, which means the M15 audit-review UI can query them with the rest of the platform DB (no Redis introspection needed for the "who's signed in?" surface).

**Negative.** A foundation change mid-PR is heavier than a bolt-on. The user explicitly chose to land it in PR #17; the diff is large. Better Auth pins a moving target — we pin to 1.6.11 (the latest stable pre-cutoff at PR time); upgrades are not automatic.

**Risk.** The SSO callback path is now Better Auth code, not ours; a regression in the library could log a clinician in with the wrong claim mapping. Mitigation: the SSO plugin's `provisionUser` hook is OUR code, so the role-mapping step is still inspectable. The integration test in `e2e/auth.spec.ts` asserts a clinician's `clinician` role surfaces on `/me` after login — that's the canary.

**Trade-off vs staying on Arctic.** Arctic+hand-rolled sessions: less library risk, more code we own to keep right. Better Auth: more library risk, much less code we own. For a clinical app where the auth surface needs to grow (admin UI, multi-hospital tenancy, impersonation for support, eventual SCIM), the Better Auth side of the trade is the rational one.

## Verification

- `pnpm typecheck` / `eslint` / `test` all green.
- `docker compose --profile demo up -d --wait` brings up the stack including the `auth` DB; `pnpm db:auth:migrate` applies the Better Auth schema; the first hit to `/api/auth/login` registers the Keycloak SSO provider in `sso_provider`.
- E2E `e2e/auth.spec.ts` signs in as `dev-clinician` via Keycloak and asserts the `clinician` role surfaces on `/me`.
- BFF smoke: `/api/ehrbase/...` returns 401 when the session has no linked Keycloak account, 200 when it does.
- Manual: open `/me`, sign in, sign out, sign in again — Better Auth issues a new session each time; the audit log shows matching LOGIN/LOGOUT pairs.

## After

- M5 observability picks up Better Auth's structured logs (it uses `pino` already).
- M15 admin UI consumes `auth.api.listUsers`, `auth.api.banUser`, `auth.api.impersonateUser`, `auth.api.revokeUserSession`.
- A deployment that wants multi-hospital tenancy enables the organization-create surface; the SSO plugin's per-org provider linking starts paying for itself.
- A deployment that wants IdP-driven user provisioning adds the SCIM plugin without code changes elsewhere.
