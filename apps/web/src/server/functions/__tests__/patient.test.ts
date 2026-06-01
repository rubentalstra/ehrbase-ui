// Orchestration tests for patient.server (M7): RBAC, the create → auto-provision
// EHR flow (rule-12 subject), the no-orphan EHR-failure path, demographic error →
// stable-code mapping, and the demo-seed trigger on the list path. The provider,
// EHR call, audit sink, and session resolve are mocked — each has its own tests.

import {
  DuplicateIdentifierError,
  type CreatePartyInput,
  type DemographicProvider,
} from '@ehrbase-ui/demographic-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/server/auth/require-role', () => ({ requireRole: vi.fn() }))
vi.mock('@/server/demographic/demo-seed.server', () => ({
  ensureDemoSeed: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/server/audit', () => ({ auditAccess: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/server/demographic/provider.factory.server', () => ({
  getDemographicProvider: vi.fn(),
  getPartyRefNamespace: () => 'demographic',
}))
vi.mock('../ehr.server.ts', () => ({ createEhrImpl: vi.fn() }))
vi.mock('@/server/bff/call-ehrbase.server', () => ({ callEhrbase: vi.fn() }))
vi.mock('@/server/bff/ehrbase-context.server', () => ({ getEhrbaseContext: vi.fn() }))
vi.mock('@tanstack/react-start/server', () => ({
  getRequest: () => ({ headers: new Headers() }),
}))

import { requireRole } from '@/server/auth/require-role'
import { ensureDemoSeed } from '@/server/demographic/demo-seed.server'
import { getDemographicProvider } from '@/server/demographic/provider.factory.server'

import { createEhrImpl } from '../ehr.server.ts'
import {
  createPatientImpl,
  getProviderCapabilitiesImpl,
  searchPatientsImpl,
} from '../patient.server.ts'

const ROLE = { sid: 's', user: { id: 'u1', email: 'admin@x', name: 'Admin', roles: ['admin'] } }

const SAMPLE: CreatePartyInput = {
  identifiers: [{ namespace: 'mrn', value: 'X1' }],
  names: [{ use: 'official', family: 'Doe', given: ['Jane'], prefix: [], suffix: [] }],
  addresses: [],
  contacts: [],
}

// Standalone mock refs for the methods we assert on — referencing these (rather
// than `provider.method`) keeps the assertions clear of @typescript-eslint/unbound-method.
const mockCreateParty = vi.fn()
const mockSearchParty = vi.fn()

function makeProvider(): DemographicProvider {
  return {
    name: 'mock',
    capabilities: { supportsMutation: true, supportsMerge: true, readonly: false },
    createParty: mockCreateParty,
    updateParty: vi.fn(),
    getParty: vi.fn(),
    searchParty: mockSearchParty,
    deactivateParty: vi.fn(),
    mergeParty: vi.fn(),
    addIdentifier: vi.fn(),
    endIdentifier: vi.fn(),
    addRelationship: vi.fn(),
    endRelationship: vi.fn(),
    listVersions: vi.fn(),
  }
}

let provider: DemographicProvider

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireRole).mockResolvedValue(ROLE)
  provider = makeProvider()
  vi.mocked(getDemographicProvider).mockReturnValue(provider)
})

describe('createPatientImpl', () => {
  it('creates the party then auto-provisions a linked EHR (rule-12 subject)', async () => {
    mockCreateParty.mockResolvedValue({
      namespace: 'demographic',
      id: 'p1',
      type: 'PERSON',
    })
    vi.mocked(createEhrImpl).mockResolvedValue({ ehrId: 'ehr1' })

    const result = await createPatientImpl(SAMPLE)

    expect(result).toEqual({
      partyRef: { namespace: 'demographic', id: 'p1', type: 'PERSON' },
      ehrId: 'ehr1',
      ehrLinked: true,
    })
    expect(vi.mocked(requireRole).mock.calls[0]).toEqual([['admin'], { phi: true }])
    expect(vi.mocked(createEhrImpl).mock.calls[0]?.[0]).toEqual({
      subject: { namespace: 'demographic', id: 'p1' },
    })
  })

  it('keeps the party (no orphan) + reports ehrLinked:false when EHR provisioning fails', async () => {
    mockCreateParty.mockResolvedValue({
      namespace: 'demographic',
      id: 'p2',
      type: 'PERSON',
    })
    vi.mocked(createEhrImpl).mockRejectedValue(new Error('ehrbase down'))

    const result = await createPatientImpl(SAMPLE)

    expect(result.ehrLinked).toBe(false)
    expect(result.ehrId).toBeNull()
    expect(result.partyRef.id).toBe('p2')
    // The EHR-provision access (success OR failure) is now audited inside
    // callEhrbase (ADR-0045 — single audit point); createEhrImpl is mocked here.
  })

  it('maps a duplicate-identifier provider error to a 409 (no PHI in the response)', async () => {
    mockCreateParty.mockRejectedValue(new DuplicateIdentifierError())

    await expect(createPatientImpl(SAMPLE)).rejects.toMatchObject({ status: 409 })
    expect(vi.mocked(createEhrImpl).mock.calls.length).toBe(0)
  })
})

describe('searchPatientsImpl', () => {
  it('gates on clinician/admin, triggers the demo seed, and queries the provider', async () => {
    mockSearchParty.mockResolvedValue({ parties: [], total: 0 })

    const result = await searchPatientsImpl({ limit: 20, offset: 0 })

    expect(result).toEqual({ parties: [], total: 0 })
    expect(vi.mocked(requireRole).mock.calls[0]).toEqual([['clinician', 'admin'], { phi: true }])
    expect(vi.mocked(ensureDemoSeed).mock.calls.length).toBe(1)
  })
})

describe('getProviderCapabilitiesImpl', () => {
  it('returns the provider capabilities', async () => {
    const caps = await getProviderCapabilitiesImpl()
    expect(caps).toEqual({ supportsMutation: true, supportsMerge: true, readonly: false })
  })
})
