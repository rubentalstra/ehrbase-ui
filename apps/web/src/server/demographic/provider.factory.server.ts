// Demographic provider factory (ADR-0031). Resolves the concrete
// DemographicProvider from DEMOGRAPHIC_PROVIDER at first use and caches it for
// the process. Wires the two app-side dependencies the adapter packages cannot
// own themselves:
//
//   1. the REAL NEN-7513 AuditSink — maps every PartyAuditEvent to logAudit()
//      with resourceType:'PARTY' + source.adapterName (rule 1; ADR-0024). This
//      is the access-trail layer; the data-lineage layer is the VERSIONED_PARTY
//      committer columns the adapter writes (the demographic analogue of an
//      openEHR CONTRIBUTION — there is no EHRbase in this path).
//   2. the pseudonymiser — HMAC-SHA256 keyed by AUDIT_PSEUDONYM_SECRET, kept
//      app-side so the secret never enters an adapter package (§14.4, ADR-0037).
//
// `.server.ts`: imports the DB client + the secret-reading pseudonymiser; never
// reaches the client bundle.

import { createFhirProvider } from '@ehrbase-ui/demographic-adapter-fhir'
import {
  type AuditSink,
  type DemographicProvider,
  type PartyAuditEvent,
} from '@ehrbase-ui/demographic-core'
import { createBuiltinProvider } from '@ehrbase-ui/demographic-core/builtin'
import { pseudonymizeIdentifier } from '@ehrbase-ui/demographic-core/pseudonymize'

import { logAudit } from '@/server/audit/runtime'
import { demographicDb } from '@/server/db/demographic-client'

// PartyAuditAction → NEN-7513 AuditAction. The union is a strict subset of the
// audit enum, so this is a passthrough (kept explicit so a new verb is a
// compile error, not a silent drop).
function auditActionOf(action: PartyAuditEvent['action']): Parameters<typeof logAudit>[0]['action'] {
  return action
}

/** The real AuditSink: every PARTY op lands a NEN-7513 row tagged with the adapter name. */
function createLogAuditSink(adapterName: string): AuditSink {
  return {
    async record(event: PartyAuditEvent): Promise<void> {
      await logAudit({
        actor: {
          userId: event.ctx.actor.userId,
          username: event.ctx.actor.username,
          displayName: event.ctx.actor.displayName,
          roles: event.ctx.actor.roles,
        },
        action: auditActionOf(event.action),
        target: {
          resourceType: 'PARTY',
          resourceId: event.partyId,
          subjectIdHash: event.subjectIdHash,
        },
        // Administrative governance ops (merge) are SYSTEM_ADMIN, not treatment —
        // keeps the RoPA processing-activity mapping accurate (§14.2).
        purpose: event.action === 'ADMIN_CHANGE' ? 'SYSTEM_ADMIN' : 'TREATMENT',
        outcome: event.outcome,
        outcomeDetail: event.detail,
        // Demographic data is patient-identifying PHI → long retention (§14.7).
        retentionPolicy: 'CLINICAL_RECORD',
        source: {
          sessionId: event.ctx.sessionId,
          correlationId: event.ctx.correlationId,
          adapterName,
        },
      })
    },
  }
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
      audit: createLogAuditSink('fhir-r4'),
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
    audit: createLogAuditSink('builtin'),
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
