// @ehrbase-ui/openehr-cds — openEHR CDS 2.0.1 (GDL2-aligned, ADR-0021)
//
// The CdsRule authoring model for the M9 CDS infrastructure: a rule binds
// variables to archetype/AQL paths, evaluates a condition tree (when), and fires
// severity-graded actions (then). GDL2-aligned but form-authored, not raw GDL2.
// This is governance data that never crosses the EHRbase wire, so CDS tracks the
// newest stable spec.
//
// Source: https://specifications.openehr.org/releases/CDS/Release-2.0.1 (GDL2 = STABLE)

export * from "./cds-rule.ts";
export { SPEC_COMPONENT, SPEC_VERSION } from "./spec.ts";
