// Lenient DV_INTERVAL facade parse (F3 — §7 library-completeness).
//
// ITS-JSON marks `lower_included` and `upper_included` as REQUIRED on
// DV_INTERVAL.  Real EHRbase 2.31 fixtures (e.g. `all_types_no_multimedia`)
// can omit these fields — a spec-strictness-vs-CDR-practice gap documented in
// the ADR-0016 round-trip gate comment.
//
// Approach:
//   - The generated schema (`DV_INTERVAL` in generated/current.ts) is NOT
//     altered — it remains authoritative for ITS-JSON-correct data.
//   - This facade adds `DV_INTERVAL_LENIENT`: it applies Zod `.transform` to
//     default the missing flags per the openEHR RM rule (BASE §8):
//       • When an end is BOUNDED (`lower_unbounded = false` / `upper_unbounded = false`)
//         and the corresponding `_included` flag is absent, default to `true`
//         (bounded intervals include their endpoints by convention).
//       • When an end is UNBOUNDED the `_included` flag is undefined/irrelevant;
//         the openEHR spec states unbounded ends are always excluded — default `false`.
//   - The transform produces a value that satisfies the STRICT generated schema,
//     so the output type is `DV_INTERVAL` (not a widened type).  No `as` cast
//     needed — the transform returns values the generated schema already permits.
//
// Usage: call `parseDvIntervalLenient(raw)` at FLAT read-back / STRUCTURED
// converter boundaries where the data source is EHRbase (may omit the flags).
// Canonical composition writers should use the strict `DV_INTERVAL` directly.
//
// Spec ref: openEHR BASE §8 (INTERVAL semantics); ITS-JSON RM 1.1.0.

import { z } from "zod";
import { DV_INTERVAL } from "../generated/current.ts";

/**
 * Input schema for a lenient DV_INTERVAL: `lower_included` and `upper_included`
 * are accepted as optional (they may be absent in real EHRbase data).
 */
const DV_INTERVAL_INPUT = z.object({
  lower: z.record(z.string(), z.unknown()).optional(),
  upper: z.record(z.string(), z.unknown()).optional(),
  lower_unbounded: z.boolean(),
  upper_unbounded: z.boolean(),
  lower_included: z.boolean().optional(),
  upper_included: z.boolean().optional(),
  _type: z.literal("DV_INTERVAL").optional(),
});

/**
 * Lenient DV_INTERVAL parser.  Accepts the same input as `DV_INTERVAL` but
 * tolerates absent `lower_included`/`upper_included` flags, defaulting them
 * per the openEHR RM rule:
 *   - bounded end → included defaults to `true`
 *   - unbounded end → included defaults to `false`
 *
 * Returns `null` when the input does not match the DV_INTERVAL shape at all
 * (i.e. the non-`_included` required fields are missing or wrong type).
 */
export function parseDvIntervalLenient(raw: unknown): DV_INTERVAL | null {
  const input = DV_INTERVAL_INPUT.safeParse(raw);
  if (!input.success) return null;

  const { lower, upper, lower_unbounded, upper_unbounded, _type } = input.data;

  // Apply the RM-rule default for the _included flags.
  const lower_included: boolean =
    input.data.lower_included !== undefined
      ? input.data.lower_included
      : !lower_unbounded; // bounded → true, unbounded → false

  const upper_included: boolean =
    input.data.upper_included !== undefined
      ? input.data.upper_included
      : !upper_unbounded;

  const coerced = {
    lower,
    upper,
    lower_unbounded,
    upper_unbounded,
    lower_included,
    upper_included,
    _type,
  };

  const result = DV_INTERVAL.safeParse(coerced);
  if (!result.success) return null;
  return result.data;
}

/**
 * The Zod schema equivalent of `parseDvIntervalLenient` — a `.transform`-based
 * schema that accepts a lenient DV_INTERVAL input and produces a strict
 * `DV_INTERVAL` output (with `_included` flags always present).
 *
 * Use this anywhere a Zod schema is needed inline (e.g. in `.superRefine` or
 * as a field schema). For imperative checks, prefer `parseDvIntervalLenient`.
 */
export const DV_INTERVAL_LENIENT = DV_INTERVAL_INPUT.transform((input) => {
  const lower_included: boolean =
    input.lower_included !== undefined ? input.lower_included : !input.lower_unbounded;
  const upper_included: boolean =
    input.upper_included !== undefined ? input.upper_included : !input.upper_unbounded;
  return {
    lower: input.lower,
    upper: input.upper,
    lower_unbounded: input.lower_unbounded,
    upper_unbounded: input.upper_unbounded,
    lower_included,
    upper_included,
    _type: input._type,
  };
});

export type DV_INTERVAL_LENIENT = z.infer<typeof DV_INTERVAL_LENIENT>;
