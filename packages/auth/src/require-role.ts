// requireRole — RBAC on top of Better Auth (docs/architecture.md §5.6;
// ADR-0028).
//
// Reads the Better Auth session inline (the official pattern; no bespoke
// AuthContext wrapper). Realm roles live on `session.user.keycloakRoles`,
// populated by the SSO `provisionUser` hook in
// src/lib/auth/auth.server.ts.
//
// A pure RBAC denial returns 403 and audits ACCESS_DENIED. For PHI routes
// the 403 additionally carries a `break-glass: available` header so the UI
// can offer the emergency-access path (§5.6) instead of a dead end.

import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { authDb } from '@ehrbase-ui/db-platform/auth-client'
import { account as accountTable } from '@ehrbase-ui/db-platform/auth'
import { logAudit } from '@ehrbase-ui/audit/server'
import { getAuthInstance } from './instance.ts'
import { getAuthRequestHeaders } from './request-context.ts'

const RealmAccessSchema = z
  .object({
    realm_access: z
      .object({ roles: z.array(z.string()).default([]) })
      .partial()
      .optional(),
  })
  .partial()

// Mirrors auth.functions.ts: only the four app-realm roles count for RBAC.
const APP_REALM_ROLES = new Set([
  'clinician',
  'admin',
  'audit-reviewer',
  'researcher',
])

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

export type RequireRoleOptions = {
  // When true (a patient-PHI route), a denial advertises break-glass.
  phi?: boolean
}

export type RoleContext = {
  sid: string
  user: {
    id: string
    email: string
    name: string
    roles: string[]
  }
}

function forbidden(breakGlassAvailable: boolean): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (breakGlassAvailable) headers['break-glass'] = 'available'
  return new Response(JSON.stringify({ code: 'ACCESS_DENIED' }), {
    status: 403,
    headers,
  })
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ code: 'UNAUTHENTICATED' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  })
}

export async function requireRole(
  roles: string[],
  options: RequireRoleOptions = {},
): Promise<RoleContext> {
  const session = await getAuthInstance().api.getSession({
    headers: getAuthRequestHeaders(),
  })
  if (!session) throw unauthorized()

  // Decode the realm roles fresh from the linked Keycloak access_token —
  // see auth.functions.ts::getSessionWithRoles for the same pattern.
  const accountRow = await authDb
    .select({
      accessToken: accountTable.accessToken,
      idToken: accountTable.idToken,
    })
    .from(accountTable)
    .where(eq(accountTable.userId, session.user.id))
    .limit(1)
  const realmAccess = RealmAccessSchema.safeParse(
    decodeJwtPayload(accountRow[0]?.accessToken) ?? {},
  )
  let raw = realmAccess.success
    ? (realmAccess.data.realm_access?.roles ?? [])
    : []
  if (raw.length === 0) {
    const idRealm = RealmAccessSchema.safeParse(
      decodeJwtPayload(accountRow[0]?.idToken) ?? {},
    )
    raw = idRealm.success ? (idRealm.data.realm_access?.roles ?? []) : []
  }
  const keycloakRoles = raw.filter((r) => APP_REALM_ROLES.has(r))
  const allowed = roles.some((r) => keycloakRoles.includes(r))
  const ctx: RoleContext = {
    sid: session.session.token,
    user: {
      id: session.user.id,
      email: session.user.email ?? '',
      name: session.user.name ?? '',
      roles: keycloakRoles,
    },
  }
  if (allowed) return ctx

  await logAudit({
    actor: {
      userId: ctx.user.id,
      username: ctx.user.email,
      displayName: ctx.user.name,
      roles: ctx.user.roles,
    },
    action: 'ACCESS_DENIED',
    target: { resourceType: 'SYSTEM' },
    purpose: 'TREATMENT',
    outcome: 'FAILURE',
    outcomeDetail: `requires one of: ${roles.join(', ')}`,
    retentionPolicy: 'AUTH_LOG',
    source: { sessionId: ctx.sid },
  })

  throw forbidden(options.phi ?? false)
}
