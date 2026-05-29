// apps/web bootstraps the @/server/auth Better Auth instance with the
// TanStack-Start-specific cookies plugin and registers the result via the
// service locator. Every other consumer (break-glass, require-role, the
// createServerFn wrappers in auth.functions.ts) reaches the instance
// through getAuthInstance() — per ADR-0030 packages/auth has no direct
// TanStack import.
//
// Per the Better Auth docs, `tanstackStartCookies()` MUST be the LAST
// plugin in the array (otherwise cookie writes silently no-op on the
// response). The buildAuth() factory appends `extraPlugins` after its
// own admin/organization/sso plugins, so passing it here gets the right
// ordering.

import { tanstackStartCookies } from 'better-auth/tanstack-start'

import { buildAuth, setAuthInstance } from '@/server/auth'

const BETTER_AUTH_SECRET =
  process.env.BETTER_AUTH_SECRET ?? 'dev-only-rotate-in-prod'
const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'

// Keycloak's origin must appear in trustedOrigins so the SSO plugin is
// willing to fetch its OIDC discovery document. Better Auth matches the
// URL's ORIGIN (scheme + host + port) against the patterns — not the full
// path — so we derive `new URL(envValue).origin` from each configured
// Keycloak URL.
function toOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    return new URL(value).origin
  } catch {
    return undefined
  }
}
const trustedOrigins = [
  toOrigin(process.env.SSO_KEYCLOAK_ISSUER),
  toOrigin(process.env.KEYCLOAK_ISSUER_URL),
  toOrigin(process.env.KEYCLOAK_INTERNAL_ISSUER_URL),
  toOrigin(BETTER_AUTH_URL),
].filter((s): s is string => typeof s === 'string' && s.length > 0)

export const auth = buildAuth({
  secret: BETTER_AUTH_SECRET,
  baseURL: BETTER_AUTH_URL,
  trustedOrigins,
  extraPlugins: [tanstackStartCookies()],
})

// Register with the @/server/auth service locator so break-glass +
// require-role + the M5+ server functions can reach the instance.
setAuthInstance(auth)

// Re-export the SSO-bootstrap helper so apps/web's auth route handler
// keeps the same call site (`ensureKeycloakSsoProviderRegistered()`).
export { ensureKeycloakSsoProviderRegistered } from '@/server/auth'
