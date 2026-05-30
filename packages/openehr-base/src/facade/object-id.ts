// Named convenience unions for the openEHR BASE object-identifier supertypes.
//
// The custom generator now emits the polymorphic references (OBJECT_REF /
// LOCATABLE_REF / PARTY_REF / ACCESS_GROUP_REF) correctly — each `id` field is a
// `z.union` of the concrete id types — so those are re-exported straight from
// the generated module. What the generator does NOT emit is a *named* handle on
// the abstract id supertypes (they are inlined as anonymous hoisted unions), so
// the facade provides OBJECT_ID / UID_BASED_ID for consumers that reference them
// directly. Plain `z.union` (matching the generated refs): `.strict()` members
// with an optional literal `_type` disambiguate without a discriminator.

import { z } from "zod";
import * as gen from "../generated/current.ts";

// OBJECT_ID — the identifier types an OBJECT_REF / PARTY_REF may carry.
export const OBJECT_ID = z.union([
  gen.TERMINOLOGY_ID,
  gen.GENERIC_ID,
  gen.OBJECT_VERSION_ID,
  gen.HIER_OBJECT_ID,
  gen.ARCHETYPE_ID,
  gen.TEMPLATE_ID,
]);
export type OBJECT_ID = z.infer<typeof OBJECT_ID>;

// UID_BASED_ID — the subset a LOCATABLE_REF may carry.
export const UID_BASED_ID = z.union([gen.OBJECT_VERSION_ID, gen.HIER_OBJECT_ID]);
export type UID_BASED_ID = z.infer<typeof UID_BASED_ID>;
