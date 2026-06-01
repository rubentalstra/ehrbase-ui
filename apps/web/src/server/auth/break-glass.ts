// Break-glass emergency access (ADR-0045 — supersedes the legacy §5.6 flow).
//
// Standards model (IHE BTG / ISO 27789 / NEN-7513): break-glass is a per-EHR,
// time-limited access mode a CLINICIAN explicitly declares. It is NOT a silent
// session elevation — every declaration:
//   1. is gated to the `clinician` persona (admins/reviewers/researchers cannot
//      break the glass — they have their own access paths);
//   2. persists a DURABLE record in the `audit` schema (`break_glass_grant`)
//      carrying the mandatory justification — the evidence the audit-reviewer
//      needs, which must outlive the short Valkey elevation;
//   3. emits an IHE-ATNA event with PurposeOfUse = BTG (in EventIdentification —
//      ADR-0044/atna-message.ts), with NO justification text in the message
//      (rule 2 — the justification stays only in the gated grant column);
//   4. while active, flips every audited access to that EHR to PurposeOfUse=BTG
//      (callEhrbase / resolvePurposeOfUse), so the trail is reviewable.
//
// The 60-min auto-expiry + the per-lifetime ceiling (forced re-auth on abuse)
// are defence-in-depth; the AUTHORITATIVE control is the post-hoc audit-reviewer
// review loop (the durable grant + BTG trail feed it — dashboard is M22).

import { z } from 'zod'

import { auditAccess } from '@/server/audit'
import { checkRateLimit } from '@/server/bff'
import { breakGlassGrant } from '@/server/db/audit'
import { auditDb } from '@/server/db/audit-client'
import { appLog } from '@/server/observability/log'
import { valkey } from '@ehrbase-ui/valkey'

import { getAuthInstance } from './instance.ts'
import type { RoleContext } from './require-role.ts'

export const GRANT_TTL_SECONDS = 60 * 60
export const MIN_JUSTIFICATION = 30
/** Only the clinical persona may declare break-glass (the four clinical roles
 *  inherit `clinician` — ADR-0040). admin / audit-reviewer / researcher cannot. */
export const BREAK_GLASS_ROLE = 'clinician'

export const BreakGlassRequestSchema = z.object({
  justification: z.string().min(MIN_JUSTIFICATION),
  // REQUIRED: break-glass is scoped to ONE EHR (the patient the emergency is
  // for) — never a blanket session elevation (ISO 27789 subject-of-care).
  ehrId: z.string().uuid(),
})

export type BreakGlassRequest = z.infer<typeof BreakGlassRequestSchema>

// Per (user, EHR) elevation — NOT per session. A clinician may hold concurrent
// break-glass grants for different patients; each is independently scoped.
const grantKey = (userId: string, ehrId: string) => `breakglass:${userId}:${ehrId}`

export type BreakGlassOutcome =
  | { status: 'granted'; expiresInSeconds: number }
  | { status: 'denied' }
  | { status: 'forced_logout' }

export async function grantEmergencyAccess(
  auth: RoleContext,
  req: BreakGlassRequest,
): Promise<BreakGlassOutcome> {
  // Persona gate: only clinicians break the glass.
  if (!auth.user.roles.includes(BREAK_GLASS_ROLE)) {
    await auditAccess({
      action: 'ACCESS_DENIED',
      outcome: 'FAILURE',
      actor: auditActor(auth),
      purposeOfUse: 'BTG',
      resource: { type: 'EHR', id: req.ehrId, isPatient: true },
      sourceComponent: 'bff',
      correlationId: auth.sid,
      eventTime: new Date().toISOString(),
      detail: 'break-glass:denied-non-clinician',
    })
    return { status: 'denied' }
  }

  // Lifetime ceiling — the Nth attempt is refused and forces re-authentication.
  const limit = await checkRateLimit('emergency-access', auth.sid)
  if (!limit.allowed) {
    await getAuthInstance()
      .api.revokeUserSessions({ body: { userId: auth.user.id }, headers: new Headers() })
      .catch(() => undefined)
    return { status: 'forced_logout' }
  }

  const grantId = crypto.randomUUID()
  const now = Date.now()
  const grantedAt = new Date(now).toISOString()
  const expiresAt = new Date(now + GRANT_TTL_SECONDS * 1000).toISOString()

  // 1. Durable evidence (the justification lives ONLY here — gated, never in the
  //    ATNA message / logs). auditDb = audit_writer (INSERT + SELECT only).
  await auditDb.insert(breakGlassGrant).values({
    grantId,
    grantedAt,
    expiresAt,
    actorUserId: auth.user.id,
    actorUsername: auth.user.email || auth.user.id,
    actorRoles: auth.user.roles,
    ehrId: req.ehrId,
    purposeOfUse: 'BTG',
    justification: req.justification,
    correlationId: auth.sid,
  })

  // 2. IHE-ATNA grant event (PHI-free; PurposeOfUse=BTG in EventIdentification).
  await auditAccess({
    action: 'EXECUTE',
    outcome: 'SUCCESS',
    actor: auditActor(auth),
    purposeOfUse: 'BTG',
    resource: { type: 'EHR', id: req.ehrId, isPatient: true },
    sourceComponent: 'bff',
    correlationId: auth.sid,
    eventTime: grantedAt,
    detail: 'break-glass:granted',
  })

  // 3. Fast gate-check cache, keyed per (user, EHR), derivative of the durable row.
  await valkey.set(
    grantKey(auth.user.id, req.ehrId),
    JSON.stringify({ grantId, grantedAt: now, expiresAt: now + GRANT_TTL_SECONDS * 1000 }),
    'EX',
    GRANT_TTL_SECONDS,
  )

  return { status: 'granted', expiresInSeconds: GRANT_TTL_SECONDS }
}

function auditActor(auth: RoleContext): { userId: string; username: string; roles: string[] } {
  return {
    userId: auth.user.id,
    username: auth.user.email || auth.user.id,
    roles: auth.user.roles,
  }
}

const ActiveGrantSchema = z.object({
  grantId: z.string(),
  grantedAt: z.number(),
  expiresAt: z.number(),
})
export type ActiveBreakGlass = z.infer<typeof ActiveGrantSchema>

/** The active break-glass elevation for (user, EHR), or null. */
export async function getActiveBreakGlass(
  userId: string,
  ehrId: string,
): Promise<ActiveBreakGlass | null> {
  try {
    const raw = await valkey.get(grantKey(userId, ehrId))
    if (!raw) return null
    const parsed = ActiveGrantSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch (err) {
    appLog.error({ err }, '[break-glass] active-grant lookup failed')
    return null
  }
}

/** True when (user, EHR) currently holds a break-glass elevation. */
export async function hasActiveBreakGlass(userId: string, ehrId: string): Promise<boolean> {
  return (await getActiveBreakGlass(userId, ehrId)) !== null
}
