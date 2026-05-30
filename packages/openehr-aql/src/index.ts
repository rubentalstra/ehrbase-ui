// @ehrbase-ui/openehr-aql — openEHR Query (AQL) 1.1.0
//
// A typed AST for AQL statements, combinator builders for WHERE conditions, and
// a serializer (AST → AQL string) + parameter collector. Backs the project's
// stored-query catalogue; the grammar/parser + CodeMirror editor are deferred to
// M16 (AQL editor + data tables).
//
// AQL is sent to EHRbase, so we track the dialect the server accepts (QUERY 1.1.0).
// Source: https://specifications.openehr.org/releases/QUERY/Release-1.1.0

export * from "./ast.ts";
export * from "./serialize.ts";
export * from "./builder.ts";
export { SPEC_COMPONENT, SPEC_VERSION } from "./spec.ts";
