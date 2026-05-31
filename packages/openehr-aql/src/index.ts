// @ehrbase-ui/openehr-aql — openEHR Query (AQL) 1.1.0
//
// A complete, symmetric AQL 1.1.0 library:
//   - a typed AST (ast.ts) covering SELECT / FROM (+ CONTAINS, incl. VERSION),
//     WHERE, ORDER BY, LIMIT/OFFSET/FETCH, function expressions, and temporal
//     version predicates;
//   - combinator builders (builder.ts) for WHERE conditions, functions, and
//     version selectors;
//   - a serializer (serialize.ts) AST → AQL string + parameter collector;
//   - a hand-written recursive-descent parser (parse.ts) AQL string → AST,
//     the inverse of the serializer (they round-trip);
//   - identifier-level validation (validate.ts) against @ehrbase-ui/openehr-rm
//     + @ehrbase-ui/openehr-am.
//
// AQL is sent to EHRbase, so we track the dialect the server accepts (QUERY 1.1.0).
// Source: https://specifications.openehr.org/releases/QUERY/Release-1.1.0

export * from "./ast.ts";
export * from "./serialize.ts";
export * from "./builder.ts";
export * from "./parse.ts";
export * from "./validate.ts";
export { SPEC_COMPONENT, SPEC_VERSION } from "./spec.ts";
