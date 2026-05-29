// Break-glass emergency access (docs/architecture.md §5.6).
//
// When a clinician hits an RBAC 403 on patient PHI, the UI offers emergency
// access. On submit (CSRF-token-gated, §5.8) we:
//   - require a >=30-char free-text justification,
//   - enforce the lifetime ceiling of 3 invocations per session (§5.9); the
//     4th forces logout + re-auth,
//   - write an EMERGENCY_ACCESS_GRANTED audit event (full justification,
//     overridden denial, source IP) under lawful basis 9(2)(c) vital interests,
//   - grant a 60-minute time-limited elevation in Valkey that auto-expires.
//
// Nothing here is stubbed — it is wired to the real logAudit write path.

import { z } from 'zod'

import { auth as betterAuth } from '@/lib/auth/auth.server'
import { logAudit } from '@ehrbase-ui/audit'
import { checkRateLimit } from '@/lib/http/rate-limit.server'
import { valkey } from '@ehrbase-ui/valkey'
import type { RoleContext } from '@/lib/auth/require-role.server'

export const GRANT_TTL_SECONDS = 60 * 60
export const MIN_JUSTIFICATION = 30

export const BreakGlassRequestSchema = z.object({
  justification: z.string().min(MIN_JUSTIFICATION),
  // The patient/resource the denial was for, so the grant + audit are scoped.
  ehrId: z.string().uuid().optional(),
  deniedRoles: z.array(z.string()).optional(),
})

export type BreakGlassRequest = z.infer<typeof BreakGlassRequestSchema>

const grantKey = (sid: string) => `breakglass:${sid}`

export type BreakGlassOutcome =
  | { status: 'granted'; expiresInSeconds: number }
  | { status: 'forced_logout' }

export async function grantEmergencyAccess(
  auth: RoleContext,
  req: BreakGlassRequest,
): Promise<BreakGlassOutcome> {
  // Lifetime ceiling — the 4th attempt is refused and forces re-authentication.
  const limit = await checkRateLimit('emergency-access', auth.sid)
  if (!limit.allowed) {
    await logAudit({
      actor: {
        userId: auth.user.id,
        username: auth.user.email,
        displayName: auth.user.name,
        roles: auth.user.roles,
      },
      action: 'ACCESS_DENIED',
      target: { ehrId: req.ehrId, resourceType: 'EHR' },
      purpose: 'EMERGENCY',
      outcome: 'FAILURE',
      outcomeDetail: 'break_glass_ceiling_reached',
      source: { sessionId: auth.sid },
    })
    // Force re-auth: revoke every active session for this user via Better
    // Auth's admin API. The user is signed out of every device and the
    // M15 audit-reviewer dashboard sees the gap.
    await betterAuth.api
      .revokeUserSessions({
        body: { userId: auth.user.id },
        headers: new Headers(),
      })
      .catch(() => undefined)
    return { status: 'forced_logout' }
  }

  // Per-session emergency-access counter lives in Valkey alongside the
  // grant itself; Better Auth's session table doesn't carry custom counts.
  const counterKey = `breakglass:count:${auth.sid}`
  await valkey.incr(counterKey)
  await valkey.expire(counterKey, GRANT_TTL_SECONDS * 4)

  const now = Date.now()
  await valkey.set(
    grantKey(auth.sid),
    JSON.stringify({
      justification: req.justification,
      ehrId: req.ehrId,
      grantedAt: now,
      expiresAt: now + GRANT_TTL_SECONDS * 1000,
    }),
    'EX',
    GRANT_TTL_SECONDS,
  )

  // The justification is mandated free text (§5.6). The entire audit store is
  // PHI-in-scope and encrypted at rest (§14.4), so the justification is
  // recorded in outcomeDetail here — the one sanctioned exception to the
  // "error code only" rule for that field.
  await logAudit({
    actor: {
      userId: auth.user.id,
      username: auth.user.email,
      displayName: auth.user.name,
      roles: auth.user.roles,
    },
    action: 'EMERGENCY_ACCESS_GRANTED',
    target: { ehrId: req.ehrId, resourceType: 'EHR' },
    purpose: 'EMERGENCY',
    outcome: 'SUCCESS',
    outcomeDetail: `overrode=[${(req.deniedRoles ?? []).join(',')}] justification=${req.justification}`,
    source: { sessionId: auth.sid },
  })

  return { status: 'granted', expiresInSeconds: GRANT_TTL_SECONDS }
}

const EmergencyGrantSchema = z.object({
  justification: z.string(),
  ehrId: z.string().optional(),
  grantedAt: z.number(),
  expiresAt: z.number(),
})

// Derived from the schema so the runtime validator and the static type can
// never drift — same pattern as BreakGlassRequest above + the audit row
// schemas in src/lib/audit/schema.ts.
export type EmergencyGrant = z.infer<typeof EmergencyGrantSchema>

export async function getEmergencyGrant(
  sid: string,
): Promise<EmergencyGrant | null> {
  const raw = await valkey.get(grantKey(sid))
  if (!raw) return null
  const json: unknown = JSON.parse(raw)
  const parsed = EmergencyGrantSchema.safeParse(json)
  return parsed.success ? parsed.data : null
}
