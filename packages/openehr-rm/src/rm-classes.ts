// RM class-name registry (RM 1.1.0).
//
// A stable, hand-free list of the concrete RM class names this package models,
// derived from the generated module's exported schema identifiers (every
// generated export is an ALL-CAPS class const + its inferred type). Consumers
// that need to validate an *identifier* — e.g. the AQL validator checking that
// an archetype id's RM-class segment or a FROM rmType names a real RM class —
// use this instead of importing 100+ Zod schemas individually.
//
// Single source of truth: the generated `current.ts`. `pnpm regen` keeps the
// generated module in sync with the spec; this registry follows automatically.

import * as generated from "./generated/current.ts";

const CLASS_NAME_RE = /^[A-Z][A-Z0-9_]*$/;

/** Every concrete RM 1.1.0 class name (e.g. "COMPOSITION", "OBSERVATION"). */
export const RM_CLASS_NAMES: ReadonlySet<string> = new Set(
  Object.keys(generated).filter((k) => CLASS_NAME_RE.test(k)),
);

/** Whether `name` is a concrete RM 1.1.0 class. */
export function isRmClass(name: string): boolean {
  return RM_CLASS_NAMES.has(name);
}
