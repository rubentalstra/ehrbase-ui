// Demographic provider factory (ADR-0031). Resolves the concrete
// DemographicProvider from DEMOGRAPHIC_PROVIDER at first use and caches it for
// the process. Wires the two app-side dependencies the adapter packages cannot
// own themselves:
//
//   1. an AuditSink — currently a no-op (the NEN-7513 audit subsystem was
//      removed; the port stays so the demographic-core contract is unchanged
//      and a real sink can be re-attached later).
//   2. the pseudonymiser — HMAC-SHA256 keyed by AUDIT_PSEUDONYM_SECRET, kept
//      app-side so the secret never enters an adapter package (rule 12, ADR-0037).
//
// `.server.ts`: imports the DB client + the secret-reading pseudonymiser; never
// reaches the client bundle.

import { createFhirProvider } from '@ehrbase-ui/demographic-adapter-fhir'
import { type AuditSink, type DemographicProvider } from '@ehrbase-ui/demographic-core'
import { createBuiltinProvider } from '@ehrbase-ui/demographic-core/builtin'
import { pseudonymizeIdentifier } from '@ehrbase-ui/demographic-core/pseudonymize'

import { demographicDb } from '@/server/db/demographic-client'

// No-op AuditSink: satisfies the demographic-core port without emitting
// anything. The access-trail layer was removed with the audit subsystem; the
// data-lineage layer is still the VERSIONED_PARTY committer columns the adapter
// writes.
const noopAuditSink: AuditSink = {
  record: async () => {},
}

function build(): DemographicProvider {
  const provider = (process.env.DEMOGRAPHIC_PROVIDER ?? 'builtin').toLowerCase()
  const partyRefNamespace = process.env.DEMOGRAPHIC_PARTY_NAMESPACE ?? 'demographic'

  if (provider === 'fhir') {
    const baseUrl = process.env.DEMOGRAPHIC_FHIR_BASE
    if (!baseUrl) {
      throw new Error('DEMOGRAPHIC_FHIR_BASE must be set when DEMOGRAPHIC_PROVIDER=fhir')
    }
    const fhirVersion = process.env.DEMOGRAPHIC_FHIR_VERSION ?? 'R4'
    if (fhirVersion !== 'R4' && fhirVersion !== 'R4B' && fhirVersion !== 'R5' && fhirVersion !== 'R6') {
      throw new Error(`DEMOGRAPHIC_FHIR_VERSION must be R4|R4B|R5|R6 (got ${fhirVersion})`)
    }
    return createFhirProvider({
      baseUrl,
      fhirVersion,
      audit: noopAuditSink,
      pseudonymize: pseudonymizeIdentifier,
      allowWrites: process.env.DEMOGRAPHIC_FHIR_ALLOW_WRITES === 'true',
      token: process.env.DEMOGRAPHIC_FHIR_TOKEN || undefined,
      partyRefNamespace,
    })
  }

  if (provider !== 'builtin') {
    throw new Error(`Unknown DEMOGRAPHIC_PROVIDER '${provider}' (expected 'builtin' or 'fhir')`)
  }

  return createBuiltinProvider({
    db: demographicDb,
    audit: noopAuditSink,
    pseudonymize: pseudonymizeIdentifier,
    partyRefNamespace,
  })
}

let cached: DemographicProvider | undefined

/** The active demographic provider for this process (constructed once). */
export function getDemographicProvider(): DemographicProvider {
  cached ??= build()
  return cached
}

/** Test seam: drop the cached provider so a test can re-resolve from env. */
export function _resetDemographicProviderForTests(): void {
  cached = undefined
}
