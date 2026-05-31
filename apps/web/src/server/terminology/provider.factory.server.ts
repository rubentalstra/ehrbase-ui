// Terminology provider factory (ADR-0034). Resolves the concrete
// TerminologyProvider from TERMINOLOGY_PROVIDER at first use and caches it for
// the process. Mirrors the demographic provider factory (ADR-0031) in shape.
//
//   TERMINOLOGY_PROVIDER=snowstorm     → SNOMED CT via Snowstorm's FHIR endpoint
//   TERMINOLOGY_PROVIDER=generic-fhir  → any FHIR R4 tx server (HAPI/Ontoserver)
//   TERMINOLOGY_PROVIDER=none (default)→ unconfigured: empty results +
//                                        capabilities.configured=false so the UI
//                                        shows "terminology not configured" and
//                                        degrades the picker to a plain text field.
//
// Terminology is NOT PHI (ADR-0034): NO AuditSink, NO pseudonymiser is wired
// (unlike the demographic factory). `.server.ts`: reads env; never reaches the
// client bundle.

import { createGenericFhirProvider } from '@ehrbase-ui/term-adapter-generic-fhir'
import { createSnowstormProvider } from '@ehrbase-ui/term-adapter-snowstorm'
import { NoneTerminologyProvider, type TerminologyProvider } from '@ehrbase-ui/term-core'

function build(): TerminologyProvider {
  const provider = (process.env.TERMINOLOGY_PROVIDER ?? 'none').toLowerCase()
  const displayLanguage = process.env.TERMINOLOGY_DISPLAY_LANGUAGE || undefined
  const token = process.env.TERMINOLOGY_TOKEN || undefined

  if (provider === 'none') {
    return new NoneTerminologyProvider()
  }

  const baseUrl = process.env.TERMINOLOGY_FHIR_BASE
  if (!baseUrl) {
    throw new Error(
      `TERMINOLOGY_FHIR_BASE must be set when TERMINOLOGY_PROVIDER=${provider}`,
    )
  }

  if (provider === 'snowstorm') {
    return createSnowstormProvider({
      baseUrl,
      token,
      defaultDisplayLanguage: displayLanguage,
      snomedVersion: process.env.TERMINOLOGY_SNOMED_VERSION || undefined,
    })
  }

  if (provider === 'generic-fhir') {
    const fhirVersion = process.env.TERMINOLOGY_FHIR_VERSION ?? 'R4'
    if (
      fhirVersion !== 'R4' &&
      fhirVersion !== 'R4B' &&
      fhirVersion !== 'R5' &&
      fhirVersion !== 'R6'
    ) {
      throw new Error(`TERMINOLOGY_FHIR_VERSION must be R4|R4B|R5|R6 (got ${fhirVersion})`)
    }
    return createGenericFhirProvider({
      baseUrl,
      fhirVersion,
      token,
      defaultDisplayLanguage: displayLanguage,
    })
  }

  throw new Error(
    `Unknown TERMINOLOGY_PROVIDER '${provider}' (expected 'snowstorm', 'generic-fhir', or 'none')`,
  )
}

let cached: TerminologyProvider | undefined

/** The active terminology provider for this process (constructed once). */
export function getTerminologyProvider(): TerminologyProvider {
  cached ??= build()
  return cached
}

/** Test seam: drop the cached provider so a test can re-resolve from env. */
export function _resetTerminologyProviderForTests(): void {
  cached = undefined
}
