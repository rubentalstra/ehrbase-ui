// @ehrbase-ui/openehr-web-template — web template parser + form-schema generator
//
// The EHRbase / Marand "Simplified Data Template" (web template) is the JSON
// EHRbase returns for an operational template (`GET /definition/template/
// adl1.4/{id}` with Accept: application/json). This package (a) parses + Zod-
// validates that document, and (b) generates a Zod schema for form state from
// it — the substrate the M6 FieldRenderer / ArrayFieldRenderer build on (§7).
//
// Hand-typed against the EHRbase 2.31.0 shape (ADR-0032): the web template is an
// EHRbase format, not a versioned openEHR spec, so there's nothing to generate
// from ITS-JSON. Field set verified against the openEHR_SDK test web templates.
//
// Source: https://docs.ehrbase.org/docs/EHRbase/Explore/Simplified-data-template/WebTemplate

export * from "./web-template.ts";
export * from "./generate-form-schema.ts";
export { SPEC_COMPONENT, SPEC_VERSION } from "./spec.ts";
