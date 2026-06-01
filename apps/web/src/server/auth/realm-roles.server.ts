// Authoritative role resolution: Keycloak realm roles are read FRESH from the
// linked `account.access_token` JWT (id_token fallback), never from a
// denormalised column. This mirrors require-role.ts + auth.functions.ts so every
// consumer agrees on a single source of truth. (The `user.keycloak_roles` column
// is now vestigial — kept only to avoid a migration; no code writes it.)
//
// `.server.ts` (CLAUDE.md rule 7): touches the DB, never reaches the client.

import { eq } from 'drizzle-orm'

import { account as accountTable } from '@/server/db/auth'
import { authDb } from '@/server/db/auth-client'

import { decodeJwtPayload, extractRealmRoles } from './jwt.ts'

// The app-meaningful realm roles (ADR-0040 7-persona model: the four clinical
// personas inherit `clinician`). Roles outside this set are ignored for RBAC.
export const APP_REALM_ROLES = new Set([
  'clinician',
  'admin',
  'audit-reviewer',
  'researcher',
])

/** Decode the app realm roles from a Keycloak access token (id_token fallback). */
export function appRealmRolesFromTokens(
  accessToken: string | null | undefined,
  idToken?: string | null,
): string[] {
  let raw = extractRealmRoles(decodeJwtPayload(accessToken))
  if (raw.length === 0) raw = extractRealmRoles(decodeJwtPayload(idToken))
  return raw.filter((r) => APP_REALM_ROLES.has(r))
}

/** Resolve a user's app realm roles by reading their linked Keycloak account
 *  token. Returns [] if there is no linked account. */
export async function resolveUserAppRoles(userId: string): Promise<string[]> {
  const rows = await authDb
    .select({
      accessToken: accountTable.accessToken,
      idToken: accountTable.idToken,
    })
    .from(accountTable)
    .where(eq(accountTable.userId, userId))
    .limit(10)
  const row = rows.find((r) => r.accessToken !== null) ?? rows[0]
  return appRealmRolesFromTokens(row?.accessToken, row?.idToken)
}
