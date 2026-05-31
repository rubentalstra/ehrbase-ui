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

// RM-version parse guard (P1.5): a tripwire so read surfaces never silently
// mis-handle data from an upgraded EHRbase. See ./facade/guards.ts.
export {
  assertRmVersion,
  guardComposition,
  RmVersionMismatchError,
  rmVersionMatches,
} from "./facade/guards.ts";

// Null-flavour helpers + clinical value formatters (P1.5): pure, locale-light
// display utilities consumed by vitals/labs dashboards + CompositionViewer.
// See ./facade/format.ts.
export {
  formatDvCodedText,
  formatDvDate,
  formatDvDateTime,
  formatDvOrdinal,
  formatDvProportion,
  formatDvQuantity,
  formatPartyProxy,
  isElementNull,
  NULL_FLAVOUR_CODE,
  nullFlavourCode,
  nullFlavourRubric,
} from "./facade/format.ts";
export type { FormatDvDateTimeOptions, NullFlavourCode } from "./facade/format.ts";

// DV_INTERVAL lenient-parse facade (F3 — §7 library-completeness):
// tolerates absent lower_included/upper_included on real EHRbase fixtures.
export {
  DV_INTERVAL_LENIENT,
  parseDvIntervalLenient,
} from "./facade/interval.ts";

// RM class-name registry (F5): a stable identifier-level handle on the concrete
// RM 1.1.0 class names, for callers that validate identifiers (e.g. the AQL
// validator) without importing every Zod schema. See ./rm-classes.ts.
export { isRmClass, RM_CLASS_NAMES } from "./rm-classes.ts";

export { SPEC_COMPONENT, SPEC_VERSION } from "./spec.ts";
