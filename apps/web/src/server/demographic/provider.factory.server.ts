// Demographic provider factory (ADR-0031). Resolves the concrete
// DemographicProvider from DEMOGRAPHIC_PROVIDER at first use and caches it for
// the process. Wires the two app-side dependencies the adapter packages cannot
// own themselves:
//
//   1. an AuditSink — the IHE ATNA access trail (ADR-0041, M9 foundation). The
//      provider emits a PartyAuditEvent per op; PostgresAuditSink maps it to a
//      DICOM AuditMessage + appends it to the `audit` Postgres schema. Never
//      throws (a demographic op is not broken by an audit-DB hiccup).
//   2. the pseudonymiser — HMAC-SHA256 keyed by AUDIT_PSEUDONYM_SECRET, kept
//      app-side so the secret never enters an adapter package (rule 12, ADR-0037).
//
// `.server.ts`: imports the DB client + the secret-reading pseudonymiser; never
// reaches the client bundle.

import { type DemographicProvider } from '@ehrbase-ui/demographic-core'
import { createBuiltinProvider } from '@ehrbase-ui/demographic-core/builtin'
import { pseudonymizeIdentifier } from '@ehrbase-ui/demographic-core/pseudonymize'

import { PostgresAuditSink } from '@/server/audit'
import { demographicDb } from '@/server/db/demographic-client'

function build(): DemographicProvider {
  // 'builtin' is the only provider for now. The external FHIR/HL7v2/PDQ adapter
  // was removed in the core refocus — the DemographicProvider interface
  // (demographic-core) is retained so a wire adapter can be re-added behind a
  // new ADR when an external patient index is needed. Until then any non-builtin
  // value is rejected (no silent fallback — rule 13).
  const provider = (process.env.DEMOGRAPHIC_PROVIDER ?? 'builtin').toLowerCase()
  const partyRefNamespace = getPartyRefNamespace()

  if (provider !== 'builtin') {
    throw new Error(
      `Unknown DEMOGRAPHIC_PROVIDER '${provider}' (only 'builtin' is implemented; the FHIR adapter was removed — re-add via ADR)`,
    )
  }

  return createBuiltinProvider({
    db: demographicDb,
    audit: new PostgresAuditSink('demographic:builtin'),
    pseudonymize: pseudonymizeIdentifier,
    partyRefNamespace,
  })
}

/**
 * The PartyRef namespace this deployment stamps into `EHR_STATUS.subject.external_ref`
 * (rule 12) — the single source the factory + the EHR-linkage server fns share, so an
 * EHR looked up / provisioned by party id uses the same namespace `createParty` did.
 */
export function getPartyRefNamespace(): string {
  return process.env.DEMOGRAPHIC_PARTY_NAMESPACE ?? 'demographic'
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
