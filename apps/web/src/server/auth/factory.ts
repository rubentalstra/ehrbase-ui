// Better Auth instance factory (docs/architecture.md §5; ADR-0044 — supersedes
// ADR-0028/0029's SSO-plugin choice).
//
// Keycloak is integrated via the first-party **genericOAuth** plugin's
// `keycloak()` helper rather than the @better-auth/sso plugin. Rationale
// (ADR-0044): this app has ONE central Keycloak realm (tenancy is modelled by
// realm groups + the `organization` plugin, not by per-org IdPs), and — unlike
// the SSO plugin — genericOAuth providers are registered into
// `ctx.context.socialProviders`, so the core `auth.api.getAccessToken` endpoint
// can transparently REFRESH the Keycloak access token from the stored
// refresh_token. That refresh is what keeps server-side EHRbase calls (the
// forwarded-token CONTRIBUTION committer) working past the short
// accessTokenLifespan instead of 401-ing once the token expires.
//
// Realm roles are NOT provisioned onto the user row here — the authoritative
// read path decodes `account.access_token` on every request (require-role.ts,
// auth.functions.ts, realm-roles.server.ts). Keycloak stays the single source.
//
// Framework-agnostic: the host app hands in its cookie plugin via
// `extraPlugins` (tanstackStartCookies for TanStack Start), appended LAST per
// the Better Auth docs.

import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin, genericOAuth, keycloak, organization } from 'better-auth/plugins'

import { authDb } from '@/server/db/auth-client'
import * as authSchema from '@/server/db/auth'

import { decodeJwtPayload, extractKeycloakRoles } from './jwt.ts'

export type BuildAuthOptions = {
  /** BETTER_AUTH_SECRET — must be ≥32 random chars in production. */
  secret: string
  /** Canonical app URL — used in OIDC redirects + cookie domain. */
  baseURL: string
  /**
   * Origins Better Auth should fetch OIDC discovery docs from. Pass the
   * deployment's Keycloak origins (internal + external) plus the app's
   * baseURL origin.
   */
  trustedOrigins: string[]
  /** Keycloak OIDC client for the genericOAuth provider. `issuer` MUST be the
   *  URL the browser (and, via host-gateway, this server) reaches Keycloak at —
   *  every issued token's `iss` is pinned to it, and EHRbase validates that
   *  exact issuer (docker-compose ehrbase JWT_ISSUERURI). */
  keycloak: {
    issuer: string
    clientId: string
    clientSecret: string
  }
  /**
   * Framework-specific plugins (e.g. tanstackStartCookies). They are
   * appended LAST to the internal plugins list per the Better Auth docs.
   */
  extraPlugins?: BetterAuthOptions['plugins']
}

// Keycloak's OIDC provider id, fixed so the `account.provider_id` rows, the
// sign-in trigger (signIn.oauth2), and the getAccessToken refresh all agree.
export const KEYCLOAK_PROVIDER_ID = 'keycloak'

export function buildAuth(opts: BuildAuthOptions) {
  return betterAuth({
    secret: opts.secret,
    baseURL: opts.baseURL,
    trustedOrigins: opts.trustedOrigins,
    database: drizzleAdapter(authDb, { provider: 'pg', schema: authSchema }),
    // Mirror the §5.10 numbers: 15-min idle, 12-h absolute.
    session: {
      expiresIn: 60 * 60 * 12,
      updateAge: 60 * 15,
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },
    plugins: [
      // Admin moderation + impersonation. Default roles are ['user', 'admin'].
      admin(),
      // Per-hospital tenancy + per-department teams (v1.0 multi-hospital
      // story; deployments that ship single-tenant can leave the org table
      // empty and gate purely on the Keycloak realm roles).
      organization({ teams: { enabled: true } }),
      // Keycloak via OIDC (genericOAuth keycloak() helper). The discoveryUrl is
      // derived from the issuer, so token/JWKS/userinfo endpoints are
      // auto-discovered. PKCE S256 is mandatory for the realm's client.
      genericOAuth({
        config: [
          keycloak({
            clientId: opts.keycloak.clientId,
            clientSecret: opts.keycloak.clientSecret,
            issuer: opts.keycloak.issuer,
            pkce: true,
            scopes: ['openid', 'profile', 'email'],
            // Re-sync name / email from Keycloak on every sign-in — Keycloak
            // is authoritative for identity. (Keycloak returns `expires_in`, so
            // accessTokenExpiresAt is recorded and getAccessToken can refresh.)
            overrideUserInfo: true,
          }),
        ],
      }),
      // Framework-specific plugins last (per Better Auth docs; tanstackStartCookies
      // must be the final plugin or cookie writes silently no-op).
      ...(opts.extraPlugins ?? []),
    ],
  })
}

// Re-export decodeJwtPayload — break-glass + require-role use the same helper.
export { decodeJwtPayload, extractKeycloakRoles }
