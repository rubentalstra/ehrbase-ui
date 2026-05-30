// @ehrbase-ui/openehr-base — openEHR BASE 1.1.0
//
// Identifiers, object references, foundational + resource types that every
// other openehr-* package builds on.
//
// PIN: BASE 1.1.0 to match RM 1.1.0 + EHRbase 2.31.0 (ADR-0032 addendum,
// 2026-05-30) — NOT the newer BASE 1.2.0. Generated from
// openEHR/specifications-ITS-JSON (components/BASE/Release-1.1.0) via
// json-schema-to-zod (`pnpm regen`); polymorphic object references are
// hand-stitched in the facade.
//
// Source of truth: https://specifications.openehr.org/releases/BASE/Release-1.1.0
//
// Import schemas + inferred types from here — never from ./generated/*.

export * from "./facade/index.ts";
export { SPEC_COMPONENT, SPEC_VERSION } from "./spec.ts";
