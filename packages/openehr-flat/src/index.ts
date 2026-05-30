// @ehrbase-ui/openehr-flat — FLAT / simSDT (Marand) converter
//
// Converts between FORM STATE (the nested object the web-template form schema
// validates) and the EHRbase FLAT key/value map POSTed to / read from
// `…/composition?format=FLAT` (§7 write/read path). Web-template-aware: the
// template drives container vs leaf, cardinality (`:index`), and leaf `|suffix`
// encoding. Includes the FLAT path grammar (parse/build).
//
// Spec: https://specifications.openehr.org/releases/ITS-REST/latest/simplified_data_template.html
// Conventions verified against the openEHR_SDK simSDT fixtures (Apache-2.0).

export * from "./flat-path.ts";
export * from "./convert.ts";
export * from "./structured.ts";
export { SPEC_COMPONENT, SPEC_VERSION } from "./spec.ts";
