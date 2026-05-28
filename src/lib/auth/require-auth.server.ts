// requireAuth — the parent of every protected path (docs/architecture.md
// §5.5; ADR-0028).
//
// Wraps Better Auth's `auth.api.getSession({ headers })` and shapes the
// result into the same `AuthContext` the rest of the codebase consumes.
// The session token + idle/absolute timeouts are owned by Better Auth
// (configured in src/lib/auth/auth.server.ts); this layer adds:
//   - the canonical 401 shape (`{ code: 'UNAUTHENTICATED' }`) the UI uses,
//   - extraction of the Keycloak `accessToken` from the `account` row for
//     the BFF EHRbase proxy (§5),
//   - the typed `keycloakRoles` array on user (single source for
//     `requireRole`).
//
// resolveAuth() is server-only; the client-importable wrapper
// `requireAuth` (createServerFn) lives in require-auth.ts.

import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { authDb } from '@/db/auth-client.server'
import { account as accountTable } from '@/db/schema/auth'
import { auth } from '@/lib/auth/auth.server'

const SessionUserShapeSchema = z
  .object({
    keycloakRoles: z.array(z.string()).default([]),
    role: z.string().default('user'),
  })
  .partial()

export type AuthUser = {
  id: string
  email: string
  name: string
  // Keycloak realm roles, mirrored on the Better Auth user row by the SSO
  // provisionUser hook. Empty array for non-SSO logins.
  roles: string[]
  // Admin plugin: Better Auth's own role string ('user' / 'admin').
  authRole: string
}

export type AuthContext = {
  // Stable identifier of the Better Auth session. Used as the key for
  // break-glass elevation grants in Valkey (§5.6).
  sid: string
  user: AuthUser
  // Keycloak access token (from the SSO `account` row) — forwarded as the
  // Bearer to EHRbase by the BFF proxy. May be undefined for users that
  // sign in via a non-Keycloak path in the future.
  accessToken: string | undefined
}

function unauthorized(code: string): Response {
  return new Response(JSON.stringify({ code }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  })
}

export async function resolveAuth(): Promise<AuthContext> {
  const { getRequestHeaders } = await import('@tanstack/react-start/server')
  // TanStack Start's getRequestHeaders returns a TypedHeaders view that
  // doesn't tell TypeScript it's iterable. We treat the runtime value as
  // an unknown record and let Zod-style guarding pick out string entries.
  const raw: unknown = getRequestHeaders()
  const headers = new Headers()
  if (raw !== null && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string') headers.set(k, v)
    }
  }
  const session = await auth.api.getSession({ headers })
  if (!session) throw unauthorized('UNAUTHENTICATED')

  const ssoProviderId = process.env.SSO_KEYCLOAK_PROVIDER_ID ?? 'keycloak'
  const accountRows = await authDb
    .select({
      accessToken: accountTable.accessToken,
      accessTokenExpiresAt: accountTable.accessTokenExpiresAt,
    })
    .from(accountTable)
    .where(eq(accountTable.userId, session.user.id))
    .limit(5)
  // Find the row for our configured Keycloak provider. accountTable carries
  // multiple rows per user if other providers are linked.
  const accessToken =
    accountRows.find((r) => r.accessToken !== null)?.accessToken ?? undefined

  const shape = SessionUserShapeSchema.safeParse(session.user)
  const roles = shape.success ? (shape.data.keycloakRoles ?? []) : []
  const authRole = shape.success ? (shape.data.role ?? 'user') : 'user'

  // ssoProviderId is captured to leave a hook for future per-provider
  // filtering when a deployment links more than one IdP.
  void ssoProviderId

  return {
    sid: session.session.token,
    user: {
      id: session.user.id,
      email: session.user.email ?? '',
      name: session.user.name ?? '',
      roles,
      authRole,
    },
    accessToken,
  }
}
