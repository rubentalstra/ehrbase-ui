// Interval<T> — openEHR BASE Foundation type "Type defining an interval of any
// ordered type" (BASE 1.1.0 Foundation_types/Interval).
//
// The generated `INTERVAL` schema models `lower`/`upper` as untyped objects
// because JSON Schema cannot express the generic parameter T. This facade
// provides a generic factory so callers get a properly-typed interval, e.g.
// `Interval(DV_QUANTITY)` or `Interval(z.string())`.

import { z } from "zod";

/** Build a Zod schema for `Interval<T>` given the schema for the bounded type. */
export function Interval<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    lower: item.optional(),
    upper: item.optional(),
    lower_unbounded: z.boolean(),
    upper_unbounded: z.boolean(),
    lower_included: z.boolean(),
    upper_included: z.boolean(),
    _type: z.literal("INTERVAL").optional(),
  });
}

/** Parsed shape of `Interval<T>`. Shares the name with the factory (value vs type space). */
export interface Interval<T> {
  lower?: T;
  upper?: T;
  lower_unbounded: boolean;
  upper_unbounded: boolean;
  lower_included: boolean;
  upper_included: boolean;
  _type?: "INTERVAL";
}
