// @ehrbase-ui/openehr-rm — openEHR Reference Model 1.1.0
//
// EHR IM (COMPOSITION / OBSERVATION / EVALUATION / INSTRUCTION / ACTION /
// SECTION) + Demographic IM (PARTY / PERSON / PARTY_IDENTITY / CONTACT /
// ADDRESS / ROLE / PARTY_RELATIONSHIP) + Common + Data Types + Data Structures.
//
// PIN: RM 1.1.0 — exactly what EHRbase 2.31.0 implements (ADR-0032 addendum).
// Generated from openEHR/specifications-ITS-JSON (components/RM/Release-1.1.0)
// via the custom ITS-JSON→Zod generator (`pnpm regen`): one Zod schema + z.infer
// type per concrete class, recursion handled with Zod-4 getters. The abstract
// supertypes (DATA_VALUE, ITEM, ENTRY, …) are hand-stitched unions in ./facade.
//
// Cross-package: BASE identifiers/refs come from @ehrbase-ui/openehr-base.
//
// Import schemas + inferred types from here — never from ./generated/*.

export * from "./generated/current.ts";
export * from "./facade/abstract.ts";
export { SPEC_COMPONENT, SPEC_VERSION } from "./spec.ts";
