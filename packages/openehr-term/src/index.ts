// @ehrbase-ui/openehr-term — openEHR TERM 3.0.0 internal terminology
//
// The openEHR internal terminology: codesets (normal statuses, compression /
// integrity-check algorithms) and code→rubric groups (null flavours, composition
// category, setting, audit change type, instruction states, participation
// function/mode, subject relationship, term mapping purpose, event math
// function, property, …). Generated from the vendored authoritative terminology
// XML (openEHR/terminology) via `pnpm regen` (ADR-0032).
//
// This is DISTINCT from the FHIR terminology provider (@ehrbase-ui/term-core,
// ADR-0034) which serves external code systems (SNOMED CT, LOINC, …) at runtime.
//
// Source: https://specifications.openehr.org/releases/TERM/Release-3.0.0

export * from "./generated/index.ts";
export { SPEC_COMPONENT, SPEC_VERSION } from "./spec.ts";
