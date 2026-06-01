# ADR-0044 — Keycloak via the genericOAuth plugin (replaces the @better-auth/sso plugin)

- **Status:** Accepted
- **Date:** 2026-05-31
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** the SSO-plugin choice within ADR-0028 / ADR-0029 (Better Auth foundation + admin/organization plugins are RETAINED)
- **Superseded by:** —

## Context

ADR-0028/0029 integrated Keycloak through the **`@better-auth/sso`** plugin (a `sso_provider`
DB row bootstrapped at boot, browser sign-in via `authClient.signIn.sso(...)`, callback at
`/api/auth/sso/callback/keycloak`). That plugin is designed for **multi-tenant bring-your-own-IdP**
(per-organisation / per-domain providers, SAML). This app has **one central Keycloak realm** —
tenancy is modelled with realm groups + the `organization` plugin, not per-org IdPs — so the SSO
plugin's capabilities are unused while its main limitation bites us hard:

**The SSO plugin does not support `auth.api.getAccessToken`.** That endpoint resolves the provider
only from `ctx.context.socialProviders`, and the SSO plugin's providers are **not** registered there.
So there was **no library path to refresh the stored Keycloak access token**. Server-side EHRbase
calls forward that token (it is the openEHR `CONTRIBUTION` committer — rule 11), and EHRbase rejects
an expired token (`401`). With a short `accessTokenLifespan`, the entire workbench + EHR provision
would `401` once the token aged out, forcing a re-login. The interim fix was a hand-rolled
refresh_token grant in `getEhrbaseContext`, which re-implements (badly) what the library already does
for genericOAuth providers.

## Decision

**Integrate Keycloak through the first-party `genericOAuth` plugin's `keycloak()` helper.**

- `factory.ts`: `genericOAuth({ config: [keycloak({ issuer, clientId, clientSecret, pkce: true,
scopes: ['openid','profile','email'], overrideUserInfo: true })] })`. The `@better-auth/sso`
  dependency is **removed**; `sso-bootstrap.ts` (the `sso_provider` row) is deleted. The `sso_provider`
  TABLE stays (no migration) but is unused.
- Browser: `genericOAuthClient()` + `authClient.signIn.oauth2({ providerId: 'keycloak', callbackURL })`.
  Callback is `/api/auth/oauth2/callback/keycloak` (Keycloak client redirectUris already wildcard
  `http://localhost:3000/*`).
- **Token refresh is now library-handled:** because the genericOAuth provider lands in
  `socialProviders`, `auth.api.getAccessToken({ providerId: 'keycloak', userId })` transparently
  refreshes from the stored `refresh_token` when the access token is at/near expiry and persists the
  rotated tokens. `getEhrbaseContext` calls it; the hand-rolled refresh is gone.
- **Roles:** the genericOAuth provider has no `provisionUser` hook, and we no longer need one. The
  authoritative role source is already the **fresh decode of `account.access_token`** on every
  request (`require-role.ts`, `auth.functions.ts`). `getEhrbaseContext` + the break-glass endpoint
  now use the same decode (`realm-roles.server.ts`) instead of the `user.keycloak_roles` column,
  which becomes **vestigial** (kept to avoid a migration; nothing writes it).
- **Issuer pinning:** `keycloak({ issuer })` uses the browser-facing `localhost:8180` issuer. The ui
  container reaches it via `extra_hosts: localhost:host-gateway`, so discovery + token + refresh all
  hit `localhost:8180` and every issued token's `iss` is `http://localhost:8180/realms/ehrbase` —
  the value EHRbase's `JWT_ISSUERURI` validates (see the dev-stack fix in the same change).
- **Realm token lifespans** are widened so the refresh window outlives the access token:
  `accessTokenLifespan` 900→**300s**, `ssoSessionIdleTimeout` 900→**1800s** (refresh token valid up
  to 30 min idle), `ssoSessionMaxLifespan` 43200 (12 h, matches the Better Auth session). Previously
  both were 900s, so an expired access token coincided with a dead refresh token — refresh could
  never succeed.

PKCE S256 stays mandatory (realm client `pkce.code.challenge.method=S256`). The `basic` client scope
(Keycloak 26 `sub` + `auth_time` mappers) remains required — without `sub`, EHRbase's
`UserServiceImp.getCurrentUserId()` NPEs on every write (fixed in the same change).

## Consequences

- **+** Token refresh is library-owned and correct; server-side EHRbase calls survive token expiry.
- **+** Simpler: no `sso_provider` bootstrap, one fewer dependency, the documented Better Auth path
  for a single Keycloak IdP.
- **+** Single authoritative role source (token decode) everywhere; no stale denormalised cache.
- **−** Drops the SSO plugin's multi-IdP / SAML capability. Acceptable: tenancy is realm-groups +
  `organization`. If per-org IdPs are ever needed, that returns behind a new ADR.
- **Migration note:** existing `account` rows (providerId `keycloak`, accountId = the `sub`) are
  compatible; the genericOAuth callback updates the same row on next sign-in. Users re-authenticate
  once after deploy.

## Alternatives considered

- **Keep SSO + hand-rolled refresh** — works but re-implements library logic (rotation, persistence,
  concurrency) in app code; rejected as avoidable risk in a clinical auth path.
- **Hybrid (SSO login + a genericOAuth provider purely for refresh)** — two plugins for one IdP;
  rejected as confusing with no benefit over a clean migration.
