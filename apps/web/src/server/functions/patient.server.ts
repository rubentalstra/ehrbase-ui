// Server-only impl for the M7 demographic admin UI (ADR-0031, ADR-0041).
// Wraps the demographic provider (factory) + the EHR-linkage path (ehr.server).
// RBAC: reads/search → ['clinician','admin']; writes → ['admin']. Every op is
// access-audited — demographic ops via the provider's PostgresAuditSink, the
// EHRbase-side ops (EHR provision + linked-EHR lookup) via `auditAccess` here.
// Demographic errors map to STABLE CODES only — never PHI in a response (rule 2),
// mirroring routes/api/demographic/$.ts. Contract/types: patient.functions.ts.

import {
  CapabilityError,
  DemographicValidationError,
  DuplicateIdentifierError,
  PartyNotFoundError,
  type CreatePartyInput,
  type CreateRelationshipInput,
  type DemographicProviderCapabilities,
  type Party,
  type PartyRef,
  type PartySearchQuery,
  type PartyVersionRef,
  type ProviderContext,
} from '@ehrbase-ui/demographic-core'
import { z } from 'zod'

import { auditAccess } from '@/server/audit'
import { requireRole } from '@/server/auth/require-role'
import { callEhrbase } from '@/server/bff/call-ehrbase.server'
import { getEhrbaseContext } from '@/server/bff/ehrbase-context.server'
import {
  getDemographicProvider,
  getPartyRefNamespace,
} from '@/server/demographic/provider.factory.server'

import { createEhrImpl } from './ehr.server.ts'
import type {
  AddIdentifierInput,
  CreatePatientResult,
  DeactivatePatientInput,
  EndIdentifierInput,
  EndRelationshipInput,
  GetPatientInput,
  LinkedEhrResult,
  MergePatientInput,
  PartyIdInput,
  PatientSearchResult,
  ProvisionEhrResult,
  UpdatePatientInput,
} from './patient.functions.ts'

const READ_ROLES = ['clinician', 'admin']
const WRITE_ROLES = ['admin']
const JSON_MEDIA_TYPE = 'application/json'

type RoleCtx = Awaited<ReturnType<typeof requireRole>>

function fail(status: number, code: string): Response {
  return new Response(JSON.stringify({ code }), {
    status,
    headers: { 'content-type': JSON_MEDIA_TYPE },
  })
}

function providerCtx(role: RoleCtx, correlationId: string): ProviderContext {
  return {
    actor: {
      userId: role.user.id,
      username: role.user.email || role.user.id,
      displayName: role.user.name || role.user.email || role.user.id,
      roles: role.user.roles,
    },
    sessionId: role.sid,
    correlationId,
  }
}

function auditActor(role: RoleCtx): { userId: string; username: string; roles: string[] } {
  return {
    userId: role.user.id,
    username: role.user.email || role.user.id,
    roles: role.user.roles,
  }
}

// Map demographic-core typed errors → stable codes (no PHI; rule 2). Wraps only
// provider.* calls; the EHRbase path throws its own typed Response via callEhrbase.
async function viaProvider<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op()
  } catch (e) {
    if (e instanceof DemographicValidationError) throw fail(400, 'VALIDATION')
    if (e instanceof DuplicateIdentifierError) throw fail(409, 'DUPLICATE_IDENTIFIER')
    if (e instanceof PartyNotFoundError) throw fail(404, 'NOT_FOUND')
    if (e instanceof CapabilityError) throw fail(405, 'NOT_SUPPORTED')
    throw fail(500, 'INTERNAL')
  }
}

const CanonicalEhrSchema = z.object({ ehr_id: z.object({ value: z.string() }) })

// ─── Reads ───────────────────────────────────────────────────────────────────
export async function searchPatientsImpl(query: PartySearchQuery): Promise<PatientSearchResult> {
  const role = await requireRole(READ_ROLES, { phi: true })
  const ctx = providerCtx(role, crypto.randomUUID())
  return viaProvider(() => getDemographicProvider().searchParty(query, ctx))
}

export async function getPatientImpl(input: GetPatientInput): Promise<Party> {
  const role = await requireRole(READ_ROLES, { phi: true })
  const ctx = providerCtx(role, crypto.randomUUID())
  const opts = input.version === undefined ? {} : { version: input.version }
  const party = await viaProvider(() => getDemographicProvider().getParty(input.id, opts, ctx))
  if (!party) throw fail(404, 'NOT_FOUND')
  return party
}

export async function listPatientVersionsImpl(input: PartyIdInput): Promise<PartyVersionRef[]> {
  const role = await requireRole(READ_ROLES, { phi: true })
  const ctx = providerCtx(role, crypto.randomUUID())
  return viaProvider(() => getDemographicProvider().listVersions(input.id, ctx))
}

export async function getProviderCapabilitiesImpl(): Promise<DemographicProviderCapabilities> {
  await requireRole(READ_ROLES)
  return getDemographicProvider().capabilities
}

export async function getLinkedEhrImpl(input: PartyIdInput): Promise<LinkedEhrResult> {
  const role = await requireRole(READ_ROLES, { phi: true })
  const correlationId = crypto.randomUUID()
  const subject = { namespace: getPartyRefNamespace(), id: input.id }
  const { getRequest } = await import('@tanstack/react-start/server')
  const ehrCtx = await getEhrbaseContext(getRequest().headers)
  if (!ehrCtx) throw fail(401, 'UNAUTHENTICATED')

  let ehrId: string | null
  try {
    const res = await callEhrbase(ehrCtx, {
      method: 'GET',
      path: 'ehr',
      classifyPath: 'ehr',
      search: `?subject_id=${encodeURIComponent(subject.id)}&subject_namespace=${encodeURIComponent(subject.namespace)}`,
      accept: JSON_MEDIA_TYPE,
    })
    const parsed = CanonicalEhrSchema.safeParse(res.json)
    ehrId = parsed.success ? parsed.data.ehr_id.value : null
  } catch (e) {
    // callEhrbase conflates 403/404 → a 404 Response when no EHR exists for the
    // subject. Any other failure propagates.
    if (e instanceof Response && e.status === 404) ehrId = null
    else throw e
  }

  await auditAccess({
    action: 'READ',
    outcome: 'SUCCESS',
    actor: auditActor(role),
    resource: { type: 'EHR', ...(ehrId ? { id: ehrId } : {}) },
    sourceComponent: 'bff',
    correlationId,
    eventTime: new Date().toISOString(),
    detail: 'linked-ehr-lookup',
  })
  return { ehrId }
}

// ─── Writes ────────────────────────────────────────────────────────────────────
export async function createPatientImpl(input: CreatePartyInput): Promise<CreatePatientResult> {
  const role = await requireRole(WRITE_ROLES, { phi: true })
  const correlationId = crypto.randomUUID()
  const ctx = providerCtx(role, correlationId)

  // 1. Create the demographic party (the provider audits CREATE-PARTY via the sink).
  const partyRef = await viaProvider(() => getDemographicProvider().createParty(input, ctx))

  // 2. Auto-provision the linked EHR (EHR_STATUS.subject → this PartyRef; rule 12).
  //    On failure the party still exists (no orphan) and the detail offers a
  //    "Provision EHR" retry (provisionEhr).
  try {
    const { ehrId } = await createEhrImpl({
      subject: { namespace: partyRef.namespace, id: partyRef.id },
    })
    await auditAccess({
      action: 'CREATE',
      outcome: 'SUCCESS',
      actor: auditActor(role),
      resource: { type: 'EHR', id: ehrId },
      sourceComponent: 'bff',
      correlationId,
      eventTime: new Date().toISOString(),
      detail: 'provision-ehr',
    })
    return { partyRef, ehrId, ehrLinked: true }
  } catch {
    await auditAccess({
      action: 'CREATE',
      outcome: 'FAILURE',
      actor: auditActor(role),
      resource: { type: 'EHR' },
      sourceComponent: 'bff',
      correlationId,
      eventTime: new Date().toISOString(),
      detail: 'provision-ehr-failed',
    })
    return { partyRef, ehrId: null, ehrLinked: false }
  }
}

export async function updatePatientImpl(input: UpdatePatientInput): Promise<PartyRef> {
  const role = await requireRole(WRITE_ROLES, { phi: true })
  const ctx = providerCtx(role, crypto.randomUUID())
  return viaProvider(() => getDemographicProvider().updateParty(input.id, input.input, ctx))
}

export async function deactivatePatientImpl(input: DeactivatePatientInput): Promise<{ ok: true }> {
  const role = await requireRole(WRITE_ROLES, { phi: true })
  const ctx = providerCtx(role, crypto.randomUUID())
  await viaProvider(() => getDemographicProvider().deactivateParty(input.id, input.justification, ctx))
  return { ok: true }
}

export async function mergePatientImpl(input: MergePatientInput): Promise<{ ok: true }> {
  const role = await requireRole(WRITE_ROLES, { phi: true })
  const ctx = providerCtx(role, crypto.randomUUID())
  await viaProvider(() => getDemographicProvider().mergeParty(input.into, input.from, ctx))
  return { ok: true }
}

export async function addPatientIdentifierImpl(input: AddIdentifierInput): Promise<{ ok: true }> {
  const role = await requireRole(WRITE_ROLES, { phi: true })
  const ctx = providerCtx(role, crypto.randomUUID())
  await viaProvider(() =>
    getDemographicProvider().addIdentifier(input.partyId, input.namespace, input.value, ctx),
  )
  return { ok: true }
}

export async function endPatientIdentifierImpl(input: EndIdentifierInput): Promise<{ ok: true }> {
  const role = await requireRole(WRITE_ROLES, { phi: true })
  const ctx = providerCtx(role, crypto.randomUUID())
  await viaProvider(() =>
    getDemographicProvider().endIdentifier(input.partyId, input.identifierId, ctx),
  )
  return { ok: true }
}

export async function addPatientRelationshipImpl(
  input: CreateRelationshipInput,
): Promise<{ id: string }> {
  const role = await requireRole(WRITE_ROLES, { phi: true })
  const ctx = providerCtx(role, crypto.randomUUID())
  const ref = await viaProvider(() => getDemographicProvider().addRelationship(input, ctx))
  return { id: ref.id }
}

export async function endPatientRelationshipImpl(
  input: EndRelationshipInput,
): Promise<{ ok: true }> {
  const role = await requireRole(WRITE_ROLES, { phi: true })
  const ctx = providerCtx(role, crypto.randomUUID())
  await viaProvider(() => getDemographicProvider().endRelationship(input.id, ctx))
  return { ok: true }
}

export async function provisionEhrImpl(input: PartyIdInput): Promise<ProvisionEhrResult> {
  const role = await requireRole(WRITE_ROLES, { phi: true })
  const correlationId = crypto.randomUUID()
  const subject = { namespace: getPartyRefNamespace(), id: input.id }
  const { ehrId } = await createEhrImpl({ subject })
  await auditAccess({
    action: 'CREATE',
    outcome: 'SUCCESS',
    actor: auditActor(role),
    resource: { type: 'EHR', id: ehrId },
    sourceComponent: 'bff',
    correlationId,
    eventTime: new Date().toISOString(),
    detail: 'provision-ehr',
  })
  return { ehrId }
}
