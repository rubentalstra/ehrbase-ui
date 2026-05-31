// @ehrbase-ui/term-adapter-generic-fhir — any FHIR R4 Terminology Service server
// (HAPI `tx`, Ontoserver in basic mode, national terminology servers, …) behind
// the TerminologyProvider interface (ADR-0034). Version-aware like the demographic
// FHIR adapter (ADR-0033): only R4/R4B are implemented in v1.0; R5/R6 throw at
// CONSTRUCTION (not first request) so a misconfiguration fails loudly (rule 13 —
// no silent fallback).
//
// Thin wrapper over the shared FhirTerminologyProvider (term-core) — the generic
// adapter adds NO server-specific parameters; it advertises supportsSnomedEcl=false
// (most generic R4 servers don't expose ECL — ADR-0034 verification note).
//
// apps/web's provider factory selects this when TERMINOLOGY_PROVIDER=generic-fhir.

import {
  FhirTerminologyProvider,
  type FhirTerminologyConfig,
} from "@ehrbase-ui/term-core";

export type FhirVersion = "R4" | "R4B" | "R5" | "R6";

export interface GenericFhirConfig extends FhirTerminologyConfig {
  fhirVersion: FhirVersion;
}

export class GenericFhirTerminologyProvider extends FhirTerminologyProvider {
  override readonly name = "generic-fhir";

  constructor(config: GenericFhirConfig) {
    if (config.fhirVersion !== "R4" && config.fhirVersion !== "R4B") {
      throw new Error(`${config.fhirVersion} terminology mapper not implemented in v1.0`);
    }
    super(config);
  }
}

/** Construct the generic FHIR R4 terminology provider. Throws for R5/R6. */
export function createGenericFhirProvider(config: GenericFhirConfig): GenericFhirTerminologyProvider {
  return new GenericFhirTerminologyProvider(config);
}
