// EHR-access policy seam (ADR-0045): the care-relationship gate + break-glass
// purpose resolution that wrap every EHR-scoped EHRbase call (callEhrbase).
//
// EHRbase 2.31 has no ABAC (ADR-0043), so WHO-may-touch-WHICH-EHR is enforced
// here in the BFF. The decision is delegated to a pluggable
// `CareRelationshipProvider`:
//   - in-care            → normal access (PurposeOfUse = TREAT);
//   - not in-care, but an active break-glass grant for this (user, EHR)
//                         → access allowed, every touch audited PurposeOfUse=BTG;
//   - not in-care, no grant → 403 + `break-glass: available`, audited ACCESS_DENIED.
//
// The DEFAULT provider is permissive (every clinician is treated as in-care) so
// the current build is non-breaking; M9 swaps in a real care-team / encounter
// check via setCareRelationshipProvider(). The deny path + BTG tagging are fully
// wired and audited NOW, ready for that swap.
//
// `.server.ts` (rule 7): never reaches the client bundle.

import { hasActiveBreakGlass } from '@/server/auth/break-glass.ts'
import { auditAccess } from '@/server/audit'
import type { PurposeOfUse } from '@/server/audit/atna-message.ts'

import type { EhrbaseContext } from './ehrbase-context.server.ts'

export interface CareActor {
  userId: string
  roles: string[]
}

export interface CareRelationshipProvider {
  /** Does `actor` have a care relationship with the subject of `ehrId`? */
  isInCareTeam(actor: CareActor, ehrId: string): Promise<boolean>
}

// Permissive seam — M9 replaces this with a real care-team / encounter check.
const permissiveProvider: CareRelationshipProvider = {
  isInCareTeam: () => Promise.resolve(true),
}

let activeProvider: CareRelationshipProvider = permissiveProvider

/** Swap the care-relationship provider (M9 wires the real care-team check). */
export function setCareRelationshipProvider(provider: CareRelationshipProvider): void {
  activeProvider = provider
}

/** PurposeOfUse for an EHR-scoped access: BTG when an active break-glass grant
 *  covers (user, EHR); otherwise normal TREAT. */
export async function resolveAccessPurpose(
  userId: string,
  ehrId: string,
): Promise<PurposeOfUse> {
  return (await hasActiveBreakGlass(userId, ehrId)) ? 'BTG' : 'TREAT'
}

function accessDenied(): Response {
  return new Response(JSON.stringify({ code: 'ACCESS_DENIED' }), {
    status: 403,
    headers: { 'content-type': 'application/json', 'break-glass': 'available' },
  })
}

/**
 * Enforce the care-relationship gate for an EHR-scoped access. Returns normally
 * when access is allowed (in-care OR an active break-glass grant overrides);
 * otherwise audits an ACCESS_DENIED event and THROWS a 403 `Response` carrying
 * `break-glass: available` so the UI can offer the emergency-access path.
 */
export async function careRelationshipGate(
  ctx: EhrbaseContext,
  ehrId: string,
): Promise<void> {
  const actor: CareActor = { userId: ctx.user.id, roles: ctx.user.roles }
  if (await activeProvider.isInCareTeam(actor, ehrId)) return
  if (await hasActiveBreakGlass(ctx.user.id, ehrId)) return

  await auditAccess({
    action: 'ACCESS_DENIED',
    outcome: 'FAILURE',
    actor: { userId: ctx.user.id, username: ctx.user.email || ctx.user.id, roles: ctx.user.roles },
    purposeOfUse: 'TREAT',
    resource: { type: 'EHR', id: ehrId, isPatient: true },
    sourceComponent: 'bff',
    correlationId: ctx.sid,
    eventTime: new Date().toISOString(),
    detail: 'care-relationship-denied',
  })
  throw accessDenied()
}
