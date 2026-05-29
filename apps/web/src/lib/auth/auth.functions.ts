// createServerFn helpers per the official Better Auth + TanStack Start
// integration (https://better-auth.com/docs/integrations/tanstack).
//
// `getSession` returns the raw Better Auth session object (or null) — used
// by route `beforeLoad` to decide whether to redirect to `/login`.
// `ensureSession` throws when there is no session — used by protected
// server functions.
//
// `getSessionWithRoles` is the ehrbase-ui extension: returns the same
// session plus the realm-roles list decoded fresh from the `account.
// access_token` JWT (where Keycloak ships `realm_access.roles` by
// default). Avoids the write-time mirroring path entirely — no
// session-data-cookie staleness, no JSONB-column projection surprises;
// every read sees the latest token.
//
// All four helpers dynamic-import the .server.ts module so the Better
// Auth instance + its plugin imports never enter the client bundle
// (CLAUDE.md rule 7).

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

const RealmAccessSchema = z
  .object({
    realm_access: z
      .object({ roles: z.array(z.string()).default([]) })
      .partial()
      .optional(),
  })
  .partial()

// Realm roles we care about for RBAC. The Keycloak access_token's
// realm_access.roles also carries built-in roles (default-roles-ehrbase,
// offline_access, uma_authorization, etc.) — those are noise for our
// clinical RBAC. Mirrors the M2 Arctic-era `decodeClaims` filter.
const APP_REALM_ROLES = new Set([
  'clinician',
  'admin',
  'audit-reviewer',
  'researcher',
])

function filterAppRoles(all: string[]): string[] {
  return all.filter((r) => APP_REALM_ROLES.has(r))
}

function decodeJwtPayload(jwt: string | null | undefined): unknown {
  if (!jwt) return undefined
  const parts = jwt.split('.')
  const payload = parts[1]
  if (!payload) return undefined
  try {
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4)
    const json = Buffer.from(
      padded.replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    ).toString('utf8')
    const parsed: unknown = JSON.parse(json)
    return parsed
  } catch {
    return undefined
  }
}

function extractRealmRoles(payload: unknown): string[] {
  const parsed = RealmAccessSchema.safeParse(payload ?? {})
  return parsed.success ? (parsed.data.realm_access?.roles ?? []) : []
}

export const getSession = createServerFn({ method: 'GET' }).handler(async () => {
  const { getRequestHeaders } = await import('@tanstack/react-start/server')
  const { auth } = await import('@/lib/auth/auth.server')
  const headers = getRequestHeaders()
  return auth.api.getSession({ headers })
})

export const ensureSession = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { getRequestHeaders } = await import('@tanstack/react-start/server')
    const { auth } = await import('@/lib/auth/auth.server')
    const headers = getRequestHeaders()
    const session = await auth.api.getSession({ headers })
    if (!session) throw new Error('Unauthorized')
    return session
  },
)

export const getSessionWithRoles = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { getRequestHeaders } = await import('@tanstack/react-start/server')
    const { auth } = await import('@/lib/auth/auth.server')
    const headers = getRequestHeaders()
    const session = await auth.api.getSession({ headers })
    if (!session) return null

    const { authDb } = await import('@ehrbase-ui/db-platform/auth-client')
    const { account: accountTable } = await import('@ehrbase-ui/db-platform/auth')
    const { eq } = await import('drizzle-orm')
    const accountRow = await authDb
      .select({
        accessToken: accountTable.accessToken,
        idToken: accountTable.idToken,
      })
      .from(accountTable)
      .where(eq(accountTable.userId, session.user.id))
      .limit(1)
    const accessToken = accountRow[0]?.accessToken
    const idToken = accountRow[0]?.idToken
    let raw = extractRealmRoles(decodeJwtPayload(accessToken))
    if (raw.length === 0) {
      raw = extractRealmRoles(decodeJwtPayload(idToken))
    }
    return { session, keycloakRoles: filterAppRoles(raw) }
  },
)
