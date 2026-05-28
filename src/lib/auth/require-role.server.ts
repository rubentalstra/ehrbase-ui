// requireRole — RBAC on top of requireAuth (docs/architecture.md §5.6;
// ADR-0028).
//
// Roles come from Keycloak realm claims (clinician / admin / audit-reviewer /
// researcher), mirrored onto the Better Auth user row via the SSO
// `provisionUser` hook in src/lib/auth/auth.server.ts. Reading from
// `auth.user.roles` is therefore equivalent to reading the JWT claim
// directly, but without re-validating the access token every request.
//
// A pure RBAC denial returns 403 and audits ACCESS_DENIED. For PHI routes
// the 403 additionally carries a `break-glass: available` header so the UI
// can offer the emergency-access path (§5.6) instead of a dead end.

import { logAudit } from '@/lib/audit/logger.server'
import { resolveAuth, type AuthContext } from '@/lib/auth/require-auth.server'

export type RequireRoleOptions = {
  // When true (a patient-PHI route), a denial advertises break-glass.
  phi?: boolean
}

function forbidden(breakGlassAvailable: boolean): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (breakGlassAvailable) headers['break-glass'] = 'available'
  return new Response(JSON.stringify({ code: 'ACCESS_DENIED' }), {
    status: 403,
    headers,
  })
}

export async function requireRole(
  roles: string[],
  options: RequireRoleOptions = {},
): Promise<AuthContext> {
  const auth = await resolveAuth()
  const allowed = roles.some((r) => auth.user.roles.includes(r))
  if (allowed) return auth

  await logAudit({
    actor: {
      userId: auth.user.id,
      username: auth.user.email,
      displayName: auth.user.name,
      roles: auth.user.roles,
    },
    action: 'ACCESS_DENIED',
    target: { resourceType: 'SYSTEM' },
    purpose: 'TREATMENT',
    outcome: 'FAILURE',
    outcomeDetail: `requires one of: ${roles.join(', ')}`,
    retentionPolicy: 'AUTH_LOG',
    source: { sessionId: auth.sid },
  })

  throw forbidden(options.phi ?? false)
}
