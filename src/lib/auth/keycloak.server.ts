// Keycloak OIDC provider via arctic (docs/architecture.md §5.4).
//
// Dual-URL handling — the classic docker OIDC gotcha. The browser must be
// redirected to the EXTERNAL Keycloak URL (e.g. localhost:8180); the server's
// token/JWKS calls use the INTERNAL URL (e.g. keycloak:8080) when the app runs
// inside the compose network. We therefore keep two arctic instances:
//
//   keycloakBrowser — builds the authorization URL the browser is sent to.
//   keycloakServer  — performs the back-channel code exchange + refresh.
//
// In host-side `pnpm dev` both env vars point at localhost:8180, so the two
// collapse to one. In production the issuer is pinned stable via Keycloak's
// KC_HOSTNAME so token validation agrees on both sides.

import { KeyCloak } from 'arctic'
import { z } from 'zod'

// Import-safe (see valkey.server.ts): defaults rather than a load-time throw,
// so the dev SSR can evaluate this module even when Keycloak env is unset. The
// defaults match .env.example; constructing the arctic providers does no
// network I/O. Production always sets these.
const externalRealm = process.env.KEYCLOAK_ISSUER_URL ?? 'http://localhost:8180/realms/ehrbase'
const internalRealm = process.env.KEYCLOAK_INTERNAL_ISSUER_URL ?? externalRealm
const clientId = process.env.KEYCLOAK_CLIENT_ID ?? 'ehrbase-ui'
const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET ?? 'dev-only-rotate-in-prod'
const redirectUri = process.env.KEYCLOAK_REDIRECT_URI ?? 'http://localhost:3000/api/auth/callback'

export const keycloakBrowser = new KeyCloak(externalRealm, clientId, clientSecret, redirectUri)
export const keycloakServer = new KeyCloak(internalRealm, clientId, clientSecret, redirectUri)

// No `offline_access`: the realm does not permit offline tokens for this
// client/user, and the BFF refreshes tokens while the user is active (§5.10),
// for which the standard-flow refresh token suffices. Requesting offline_access
// makes the code→token exchange fail with "Offline tokens not allowed".
export const OIDC_SCOPES = ['openid', 'profile', 'email']

// Browser end-session endpoint (RP-initiated logout). Built off the external
// realm so the browser can reach it.
export function endSessionUrl(idToken: string, postLogoutRedirect: string): string {
  const url = new URL(`${externalRealm}/protocol/openid-connect/logout`)
  url.searchParams.set('id_token_hint', idToken)
  url.searchParams.set('post_logout_redirect_uri', postLogoutRedirect)
  return url.toString()
}

// ─── Claims ───────────────────────────────────────────────────────────────
// Tokens arrive over a trusted back-channel (server↔Keycloak), so we decode
// the JWT payload to read claims without re-verifying the signature.
//
// Identity (`sub`, profile, email) is read from the ID TOKEN — Keycloak 26
// access tokens can omit `sub`. Realm roles (`realm_access.roles`) are read
// from the ACCESS TOKEN. We merge the two (ID token first, access token
// second) so each contributes the claims it reliably carries.
const ClaimsSchema = z.object({
  sub: z.string(),
  preferred_username: z.string().optional(),
  name: z.string().optional(),
  email: z.string().optional(),
  realm_access: z.object({ roles: z.array(z.string()) }).optional(),
})

export type KeycloakClaims = {
  userId: string
  username: string
  name: string
  email: string
  roles: string[]
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const payload = jwt.split('.')[1]
  if (!payload) throw new Error('malformed JWT: missing payload segment')
  const json: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  if (json === null || typeof json !== 'object') {
    throw new Error('malformed JWT: payload is not an object')
  }
  return { ...json }
}

export function decodeClaims(accessToken: string, idToken: string): KeycloakClaims {
  const merged = { ...decodeJwtPayload(idToken), ...decodeJwtPayload(accessToken) }
  const claims = ClaimsSchema.parse(merged)
  return {
    userId: claims.sub,
    username: claims.preferred_username ?? claims.email ?? claims.sub,
    name: claims.name ?? claims.preferred_username ?? claims.sub,
    email: claims.email ?? '',
    roles: claims.realm_access?.roles ?? [],
  }
}
