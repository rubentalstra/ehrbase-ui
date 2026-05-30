// @ehrbase-ui/demographic-adapter-fhir — FHIR R4 Patient DemographicProvider
// (ADR-0031, ADR-0033). R4/R4B only in v1.0; R5/R6 throw at construction.
// apps/web's provider factory selects this when DEMOGRAPHIC_PROVIDER=fhir.

export {
  FhirDemographicProvider,
  type FhirProviderConfig,
  type FhirVersion,
} from "./provider.ts";
export { partyToPatient, patientToParty } from "./mapping.ts";
export { type FetchLike } from "./client.ts";
export { type FhirPatient } from "./fhir-types.ts";

import { FhirDemographicProvider, type FhirProviderConfig } from "./provider.ts";

/** Construct the FHIR R4 provider. Throws for R5/R6 (not implemented in v1.0). */
export function createFhirProvider(config: FhirProviderConfig): FhirDemographicProvider {
  return new FhirDemographicProvider(config);
}
