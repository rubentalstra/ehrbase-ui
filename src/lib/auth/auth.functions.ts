// createServerFn helpers per the official Better Auth + TanStack Start
// integration (https://better-auth.com/docs/integrations/tanstack).
//
// `getSession` returns the raw Better Auth session object (or null) — used
// by route `beforeLoad` to decide whether to redirect to `/login`.
// `ensureSession` throws when there is no session — used by protected
// server functions.
//
// `getSessionWithRoles` is the ehrbase-ui extension: it returns the same
// session plus the `keycloakRoles` JSONB column from the `user` row. The
// column is populated by the SSO `provisionUser` hook (see auth.server.ts)
// but Better Auth's session-data cookie cache may not carry custom JSONB
// columns reliably, so we always read it fresh from the DB.
//
// All three helpers dynamic-import the .server.ts module so the Better
// Auth instance + its plugin imports never enter the client bundle
// (CLAUDE.md rule 7).

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

const KeycloakRolesRowSchema = z.object({
  keycloakRoles: z.array(z.string()).default([]),
})

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

    const { authDb } = await import('@/db/auth-client.server')
    const { user: userTable } = await import('@/db/schema/auth')
    const { eq } = await import('drizzle-orm')
    const row = await authDb
      .select({ keycloakRoles: userTable.keycloakRoles })
      .from(userTable)
      .where(eq(userTable.id, session.user.id))
      .limit(1)
    const parsed = KeycloakRolesRowSchema.safeParse(row[0] ?? {})
    const keycloakRoles = parsed.success ? parsed.data.keycloakRoles : []
    return { session, keycloakRoles }
  },
)
