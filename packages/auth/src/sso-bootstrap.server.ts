// One-shot lazy bootstrap: ensure the Keycloak SSO provider row exists in
// the `sso_provider` table. apps/web's auth handler route awaits this on
// first hit so the provider is guaranteed registered before any SSO flow
// can run. Idempotent across restarts.

import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

import { authDb } from '@ehrbase-ui/db-platform/auth-client'
import * as authSchema from '@ehrbase-ui/db-platform/auth'

let _ssoBootstrap: Promise<void> | undefined

export function ensureKeycloakSsoProviderRegistered(): Promise<void> {
  _ssoBootstrap ??= registerKeycloakSsoProvider().catch((err: unknown) => {
    console.error('[auth] failed to register Keycloak SSO provider', err)
    // Retry on the next call.
    _ssoBootstrap = undefined
  })
  return _ssoBootstrap
}

async function registerKeycloakSsoProvider(): Promise<void> {
  const providerId = process.env.SSO_KEYCLOAK_PROVIDER_ID ?? 'keycloak'
  const issuer = process.env.SSO_KEYCLOAK_ISSUER
  const clientId = process.env.SSO_KEYCLOAK_CLIENT_ID
  const clientSecret = process.env.SSO_KEYCLOAK_CLIENT_SECRET
  if (!issuer || !clientId || !clientSecret) {
    console.warn(
      '[auth] SSO_KEYCLOAK_{ISSUER,CLIENT_ID,CLIENT_SECRET} not set — Keycloak SSO not registered',
    )
    return
  }
  const existing = await authDb
    .select({ id: authSchema.ssoProvider.id })
    .from(authSchema.ssoProvider)
    .where(eq(authSchema.ssoProvider.providerId, providerId))
    .limit(1)
  if (existing.length > 0) return
  await authDb.insert(authSchema.ssoProvider).values({
    id: randomUUID(),
    providerId,
    issuer,
    oidcConfig: JSON.stringify({
      clientId,
      clientSecret,
      // PKCE is mandatory for the Keycloak realm's client (S256). The
      // SSO plugin's `mergeOIDCConfig` defaults pkce to true on UPDATE
      // but the read path at sign-in does NOT — without an explicit
      // value here the auth URL ships without code_challenge_method and
      // Keycloak rejects with "Missing parameter: code_challenge_method".
      pkce: true,
      // Better Auth fetches the OIDC discovery doc on first use and
      // fills in authorization / token / userinfo / jwks endpoints.
      scopes: ['openid', 'profile', 'email'],
    }),
  })
  console.info(
    `[auth] registered Keycloak SSO provider (providerId=${providerId})`,
  )
}
