// createServerFn contracts for the M7 demographic admin UI (CLINICAL-UI.md §4
// admin/patients; ADR-0031 demographic provider; ADR-0041 audit). The typed,
// client-importable wrappers the admin UI calls — thin over the demographic
// provider (factory) + the EHR-linkage path (ehr.server). The provider's REST
// surface (routes/api/demographic/$) stays for external/programmatic use; the
// in-app UI uses these server fns per the TanStack-Start convention.
//
// RBAC (enforced in patient.server.ts): reads/search → ['clinician','admin'];
// writes → ['admin']. CLIENT-IMPORTABLE BOUNDARY: owns input schemas + output
// types; the .server.ts beside it touches the provider + EHRbase (rules 7+8).

import {
  CreatePartyInputSchema,
  CreateRelationshipInputSchema,
  PartySearchQuerySchema,
  UpdatePartyInputSchema,
  type DemographicProviderCapabilities,
  type Party,
  type PartyRef,
  type PartyVersionRef,
} from '@ehrbase-ui/demographic-core'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { EhrSubjectSchema } from './ehr.functions.ts'

// ─── Input schemas ──────────────────────────────────────────────────────────
export const PartyIdInputSchema = z.object({ id: z.string().min(1) })
export type PartyIdInput = z.infer<typeof PartyIdInputSchema>

export const GetPatientInputSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive().optional(),
})
export type GetPatientInput = z.infer<typeof GetPatientInputSchema>

export const UpdatePatientInputSchema = z.object({
  id: z.string().min(1),
  input: UpdatePartyInputSchema,
})
export type UpdatePatientInput = z.infer<typeof UpdatePatientInputSchema>

export const DeactivatePatientInputSchema = z.object({
  id: z.string().min(1),
  justification: z.string().trim().min(1).max(500),
})
export type DeactivatePatientInput = z.infer<typeof DeactivatePatientInputSchema>

export const MergePatientInputSchema = z.object({
  into: z.string().min(1),
  from: z.string().min(1),
})
export type MergePatientInput = z.infer<typeof MergePatientInputSchema>

export const AddIdentifierInputSchema = z.object({
  partyId: z.string().min(1),
  namespace: z.string().min(1),
  value: z.string().min(1),
})
export type AddIdentifierInput = z.infer<typeof AddIdentifierInputSchema>

export const EndIdentifierInputSchema = z.object({
  partyId: z.string().min(1),
  identifierId: z.string().min(1),
})
export type EndIdentifierInput = z.infer<typeof EndIdentifierInputSchema>

export const EndRelationshipInputSchema = z.object({ id: z.string().min(1) })
export type EndRelationshipInput = z.infer<typeof EndRelationshipInputSchema>

// ─── Output contracts ─────────────────────────────────────────────────────────
export interface PatientSearchResult {
  parties: Party[]
  total: number
}
export interface CreatePatientResult {
  partyRef: PartyRef
  /** The auto-provisioned EHR id, or null when EHR-create failed (offer a retry). */
  ehrId: string | null
  ehrLinked: boolean
}
export interface LinkedEhrResult {
  ehrId: string | null
}
export interface ProvisionEhrResult {
  ehrId: string
}

// ─── Server fns ───────────────────────────────────────────────────────────────
// Reads (['clinician','admin'])
export const searchPatients = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => PartySearchQuerySchema.parse(d))
  .handler(async ({ data }): Promise<PatientSearchResult> => {
    const { searchPatientsImpl } = await import('./patient.server')
    return searchPatientsImpl(data)
  })

export const getPatient = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => GetPatientInputSchema.parse(d))
  .handler(async ({ data }): Promise<Party> => {
    const { getPatientImpl } = await import('./patient.server')
    return getPatientImpl(data)
  })

export const listPatientVersions = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => PartyIdInputSchema.parse(d))
  .handler(async ({ data }): Promise<PartyVersionRef[]> => {
    const { listPatientVersionsImpl } = await import('./patient.server')
    return listPatientVersionsImpl(data)
  })

export const getProviderCapabilities = createServerFn({ method: 'GET' }).handler(
  async (): Promise<DemographicProviderCapabilities> => {
    const { getProviderCapabilitiesImpl } = await import('./patient.server')
    return getProviderCapabilitiesImpl()
  },
)

export const getLinkedEhr = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => EhrSubjectSchema.parse(d))
  .handler(async ({ data }): Promise<LinkedEhrResult> => {
    const { getLinkedEhrImpl } = await import('./patient.server')
    return getLinkedEhrImpl(data)
  })

// Writes (['admin'])
export const createPatient = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => CreatePartyInputSchema.parse(d))
  .handler(async ({ data }): Promise<CreatePatientResult> => {
    const { createPatientImpl } = await import('./patient.server')
    return createPatientImpl(data)
  })

export const updatePatient = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => UpdatePatientInputSchema.parse(d))
  .handler(async ({ data }): Promise<PartyRef> => {
    const { updatePatientImpl } = await import('./patient.server')
    return updatePatientImpl(data)
  })

export const deactivatePatient = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => DeactivatePatientInputSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { deactivatePatientImpl } = await import('./patient.server')
    return deactivatePatientImpl(data)
  })

export const mergePatient = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => MergePatientInputSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { mergePatientImpl } = await import('./patient.server')
    return mergePatientImpl(data)
  })

export const addPatientIdentifier = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => AddIdentifierInputSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { addPatientIdentifierImpl } = await import('./patient.server')
    return addPatientIdentifierImpl(data)
  })

export const endPatientIdentifier = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => EndIdentifierInputSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { endPatientIdentifierImpl } = await import('./patient.server')
    return endPatientIdentifierImpl(data)
  })

export const addPatientRelationship = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => CreateRelationshipInputSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: string }> => {
    const { addPatientRelationshipImpl } = await import('./patient.server')
    return addPatientRelationshipImpl(data)
  })

export const endPatientRelationship = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => EndRelationshipInputSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { endPatientRelationshipImpl } = await import('./patient.server')
    return endPatientRelationshipImpl(data)
  })

export const provisionEhr = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => EhrSubjectSchema.parse(d))
  .handler(async ({ data }): Promise<ProvisionEhrResult> => {
    const { provisionEhrImpl } = await import('./patient.server')
    return provisionEhrImpl(data)
  })
