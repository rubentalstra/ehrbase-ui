// Public facade for openEHR BASE 1.1.0.
//
// Consumers import from the package root (`@ehrbase-ui/openehr-base`), NEVER
// from src/generated/* — so a regen can never break callers (ADR-0032 addendum,
// future-version-readiness principle 3).
//
// This re-exports every generated leaf schema, then SHADOWS the four polymorphic
// reference schemas (OBJECT_REF / LOCATABLE_REF / PARTY_REF / ACCESS_GROUP_REF)
// and the generic INTERVAL with hand-stitched versions. Per ES-module semantics,
// the explicit named re-exports below take precedence over the `export *` names.

// All 32 generated BASE schemas (identifiers, primitives, resource types). The
// four placeholder *_REF schemas here are shadowed by the corrected versions
// re-exported beneath.
export * from "../generated/current.ts";

// Corrected polymorphic references + the OBJECT_ID / UID_BASED_ID unions.
export {
  OBJECT_ID,
  UID_BASED_ID,
  OBJECT_REF,
  LOCATABLE_REF,
  PARTY_REF,
  ACCESS_GROUP_REF,
} from "./object-id.ts";

// Generic Interval<T> factory + type (the generated `INTERVAL` is left exported
// as the raw placeholder; prefer `Interval(item)`).
export { Interval } from "./interval.ts";
