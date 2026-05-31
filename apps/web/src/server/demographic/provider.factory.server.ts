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
  // 'builtin' is the only provider for now. The external FHIR/HL7v2/PDQ adapter
  // was removed in the core refocus — the DemographicProvider interface
  // (demographic-core) is retained so a wire adapter can be re-added behind a
  // new ADR when an external patient index is needed. Until then any non-builtin
  // value is rejected (no silent fallback — rule 13).
  const provider = (process.env.DEMOGRAPHIC_PROVIDER ?? 'builtin').toLowerCase()
  const partyRefNamespace = process.env.DEMOGRAPHIC_PARTY_NAMESPACE ?? 'demographic'

  if (provider !== 'builtin') {
    throw new Error(
      `Unknown DEMOGRAPHIC_PROVIDER '${provider}' (only 'builtin' is implemented; the FHIR adapter was removed — re-add via ADR)`,
    )
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
