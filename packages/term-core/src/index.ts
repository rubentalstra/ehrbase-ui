// @ehrbase-ui/term-core — pluggable external terminology provider (ADR-0034).
// The TerminologyProvider interface + canonical types every adapter speaks (the
// FHIR R4 Terminology Service shape), the shared FHIR client + base adapter both
// concrete adapters build on, the unconfigured `none` provider, and the error
// vocabulary. Mirrors @ehrbase-ui/demographic-core in shape (ADR-0031).
//
// External terminology is complementary to @ehrbase-ui/openehr-term (the
// INTERNAL openEHR codesets) — that package owns the openEHR-native vocabularies;
// this one owns SNOMED CT / LOINC / national codes behind a stable interface.

export * from "./provider.ts";
export * from "./errors.ts";
export {
  FhirTerminologyProvider,
  type FhirTerminologyConfig,
} from "./fhir-provider.ts";
export { FhirTerminologyClient, type FetchLike, type FhirTerminologyClientConfig } from "./fhir-client.ts";
export { NoneTerminologyProvider } from "./none-provider.ts";
