// Hand-stitched polymorphic object references (openEHR BASE 1.1.0 Base_types).
//
// The ITS-JSON schemas model the `id` field of OBJECT_REF / LOCATABLE_REF /
// PARTY_REF / ACCESS_GROUP_REF with `allOf` + `if`/`then` on a `_type`
// discriminator. json-schema-to-zod cannot express that and emits
// `z.intersection(z.any(), …)` placeholders. This facade replaces them with
// proper `z.discriminatedUnion("_type", …)` over the concrete id types,
// derived from the generated leaf schemas (single source of truth). See the
// ADR-0032 addendum.

import { z } from "zod";
import * as gen from "../generated/current.ts";

// OBJECT_ID — abstract supertype of the identifier types an OBJECT_REF can
// carry. `_type` is promoted from optional to a required literal so it can act
// as the discriminator.
export const OBJECT_ID = z.discriminatedUnion("_type", [
  gen.TERMINOLOGY_ID.extend({ _type: z.literal("TERMINOLOGY_ID") }),
  gen.GENERIC_ID.extend({ _type: z.literal("GENERIC_ID") }),
  gen.OBJECT_VERSION_ID.extend({ _type: z.literal("OBJECT_VERSION_ID") }),
  gen.HIER_OBJECT_ID.extend({ _type: z.literal("HIER_OBJECT_ID") }),
  gen.ARCHETYPE_ID.extend({ _type: z.literal("ARCHETYPE_ID") }),
  gen.TEMPLATE_ID.extend({ _type: z.literal("TEMPLATE_ID") }),
]);
export type OBJECT_ID = z.infer<typeof OBJECT_ID>;

// UID_BASED_ID — the subset of OBJECT_ID a LOCATABLE_REF may carry.
export const UID_BASED_ID = z.discriminatedUnion("_type", [
  gen.OBJECT_VERSION_ID.extend({ _type: z.literal("OBJECT_VERSION_ID") }),
  gen.HIER_OBJECT_ID.extend({ _type: z.literal("HIER_OBJECT_ID") }),
]);
export type UID_BASED_ID = z.infer<typeof UID_BASED_ID>;

// OBJECT_REF — reference to any object by namespace + type + id.
export const OBJECT_REF = z.object({
  id: OBJECT_ID,
  namespace: z.string(),
  type: z.string(),
  _type: z.literal("OBJECT_REF").optional(),
});
export type OBJECT_REF = z.infer<typeof OBJECT_REF>;

// LOCATABLE_REF — reference to a LOCATABLE inside a top-level object; carries a
// UID_BASED_ID and an optional archetype/RM path.
export const LOCATABLE_REF = z.object({
  id: UID_BASED_ID,
  namespace: z.string(),
  type: z.string(),
  path: z.string().optional(),
  _type: z.literal("LOCATABLE_REF").optional(),
});
export type LOCATABLE_REF = z.infer<typeof LOCATABLE_REF>;

// PARTY_REF — reference into the demographic/PARTY space (M7 provider). Same
// shape as OBJECT_REF; `type` names the PARTY kind (PERSON, ORGANISATION, …).
export const PARTY_REF = z.object({
  id: OBJECT_ID,
  namespace: z.string(),
  type: z.string(),
  _type: z.literal("PARTY_REF").optional(),
});
export type PARTY_REF = z.infer<typeof PARTY_REF>;

// ACCESS_GROUP_REF — reference to an access-control group.
export const ACCESS_GROUP_REF = z.object({
  id: OBJECT_ID,
  namespace: z.string(),
  type: z.string(),
  _type: z.literal("ACCESS_GROUP_REF").optional(),
});
export type ACCESS_GROUP_REF = z.infer<typeof ACCESS_GROUP_REF>;
