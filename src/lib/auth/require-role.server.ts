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

import { z } from 'zod'

import { logAudit } from '@/lib/audit/logger.server'
import { auth as betterAuth } from '@/lib/auth/auth.server'

const UserShapeSchema = z
  .object({ keycloakRoles: z.array(z.string()).default([]) })
  .partial()

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
  const { getRequest } = await import('@tanstack/react-start/server')
  const session = await betterAuth.api.getSession({
    headers: getRequest().headers,
  })
  if (!session) throw unauthorized()

  const shape = UserShapeSchema.safeParse(session.user)
  const keycloakRoles = shape.success ? (shape.data.keycloakRoles ?? []) : []
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
