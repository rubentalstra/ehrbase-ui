// Pull Keycloak realm roles from the SSO userInfo payload (or the
// access_token / id_token as fallbacks) and write them onto the Better
// Auth user row so `requireRole(...)` has a single place to look. Better
// Auth invokes this on first sign-in (and on every sign-in when
// `provisionUserOnEveryLogin: true`, which we set so Keycloak is the
// authoritative source).
//
// The authoritative read path now decodes the linked `account.access_token`
// JWT on every request (auth.functions.ts::getSessionWithRoles +
// require-role); this write is kept as a denormalised cache for any future
// query that wants to filter users by role without a JWT decode per row.

import { eq } from 'drizzle-orm'

import { authDb } from '@/server/db/auth-client'
import * as authSchema from '@/server/db/auth'

import { decodeJwtPayload, extractRealmRoles } from './jwt.ts'

export type ProvisionInput = {
  user: { id?: string; email?: string | null }
  userInfo?: unknown
  token?: { accessToken?: string; idToken?: string }
}

export async function provisionFromKeycloak(args: ProvisionInput): Promise<void> {
  // Try userInfo first (cheapest path; some OIDC providers attach realm-role
  // claims there via mappers). Fall back to the access_token, where Keycloak
  // ships `realm_access.roles` by default; finally try the id_token.
  let roles = extractRealmRoles(args.userInfo)
  if (roles.length === 0 && args.token?.accessToken) {
    roles = extractRealmRoles(decodeJwtPayload(args.token.accessToken))
  }
  if (roles.length === 0 && args.token?.idToken) {
    roles = extractRealmRoles(decodeJwtPayload(args.token.idToken))
  }
  if (args.user.id) {
    await authDb
      .update(authSchema.user)
      .set({ keycloakRoles: roles })
      .where(eq(authSchema.user.id, args.user.id))
  }
}
