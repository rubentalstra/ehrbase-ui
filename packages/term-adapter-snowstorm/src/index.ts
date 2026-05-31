// @ehrbase-ui/term-adapter-snowstorm — SNOMED CT via the Snowstorm FHIR API
// (the v1.0 default per ADR-0022 + ADR-0034). Subclasses the shared
// FhirTerminologyProvider (term-core), adding the two Snowstorm-specific niceties
// the ADR calls out: the `_displayLanguage` expansion parameter and the
// SNOMED-ECL capability flag. Talks to Snowstorm's FHIR endpoint at `/fhir/`.
//
// apps/web's provider factory selects this when TERMINOLOGY_PROVIDER=snowstorm.

import {
  FhirTerminologyProvider,
  type FhirTerminologyConfig,
  type TerminologyProviderCapabilities,
} from "@ehrbase-ui/term-core";

export interface SnowstormConfig extends FhirTerminologyConfig {
  /** SNOMED edition/version module URI for `system-version` (optional). */
  snomedVersion?: string;
}

export class SnowstormTerminologyProvider extends FhirTerminologyProvider {
  override readonly name = "snowstorm";
  readonly #snomedVersion?: string;

  constructor(config: SnowstormConfig) {
    super(config);
    this.#snomedVersion = config.snomedVersion;
  }

  protected override buildCapabilities(): TerminologyProviderCapabilities {
    const base = super.buildCapabilities();
    // Snowstorm is SNOMED-native: ECL is supported, LOINC + ICD-10 are imported.
    return { ...base, supportsSnomedEcl: true };
  }

  // Snowstorm honours `_displayLanguage` (BCP-47) on $expand to localise the
  // returned displays; the generic R4 base only knows `displayLanguage`.
  protected override decorateExpandParams(params: URLSearchParams, displayLanguage?: string): void {
    if (displayLanguage !== undefined) params.set("_displayLanguage", displayLanguage);
    if (this.#snomedVersion !== undefined) params.set("system-version", this.#snomedVersion);
  }
}

/** Construct the Snowstorm terminology provider. */
export function createSnowstormProvider(config: SnowstormConfig): SnowstormTerminologyProvider {
  return new SnowstormTerminologyProvider(config);
}
