// Public facade for openEHR BASE 1.1.0.
//
// Consumers import from the package root (`@ehrbase-ui/openehr-base`), NEVER
// from src/generated/* — so a regen can never break callers (ADR-0032 addendum,
// future-version-readiness principle 3).
//
// All 32 generated BASE schemas (identifiers, primitives, resource types,
// and the now-correct polymorphic references OBJECT_REF / LOCATABLE_REF /
// PARTY_REF / ACCESS_GROUP_REF whose `id` the generator emits as a z.union).
export * from "../generated/current.ts";

// Named handles on the abstract object-id supertypes (the generator inlines
// these as anonymous unions).
export { OBJECT_ID, UID_BASED_ID } from "./object-id.ts";

// Generic Interval<T> factory + type (the generated `INTERVAL` leaves lower/upper
// untyped; prefer `Interval(item)`).
export { Interval } from "./interval.ts";
