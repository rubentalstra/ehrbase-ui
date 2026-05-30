// @ehrbase-ui/openehr-am — openEHR AM, targeting ADL 1.4 / OPT 1.4
//
// PIN: ADL 1.4 / OPT 1.4 to match EHRbase 2.31.0 (which emits ADL 1.4
// operational templates), NOT AOM2 2.3.0 — see the ADR-0032 addendum
// (2026-05-30).
//
// Minimal by design: the form-consumption format (the EHRbase web template) is
// parsed by @ehrbase-ui/openehr-web-template. What lives here is the genuinely
// reusable ADL 1.4 identifier layer — archetype-id and node-code (at/ac code)
// parsing/validation — that backs the ADR-0016 archetype catalogue and the
// clinical-UI archetype citations (Inviolable rule 10).
//
// Source: https://specifications.openehr.org/releases/AM/latest (ADL 1.4 / OPT 1.4 rows)

export * from "./archetype-id.ts";
export * from "./node-code.ts";
export { SPEC_COMPONENT, SPEC_VERSION } from "./spec.ts";
