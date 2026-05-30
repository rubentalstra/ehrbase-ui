// Null-flavour helpers + clinical value formatters (Phase 1, task P1.5).
//
// Pure, dependency-light, locale-light display utilities that future clinical
// read surfaces (vitals/labs dashboards, CompositionViewer) consume. The UI owns
// locale and display preferences and passes them in; these functions never reach
// for `Intl`, `Date`, the wall clock, or any ambient state. Every formatter is
// defensive: it accepts loosely-typed input, validates with a Zod guard, and
// returns a sensible fallback string rather than throwing.
//
// Null-flavour rubrics come from @ehrbase-ui/openehr-term's NULL_FLAVOURS
// code→rubric group (the authoritative openEHR internal terminology), never
// hardcoded here.
//
// No PHI handling, no audit, no observability — these are stringifiers.

import { NULL_FLAVOURS } from "@ehrbase-ui/openehr-term";
import { z } from "zod";

// ── Null-flavour helpers ───────────────────────────────────────────────────

/**
 * The four standard openEHR null-flavour codes (TERM group `null flavours`,
 * terminology `openehr`). Mirrors @ehrbase-ui/openehr-term's NULL_FLAVOURS keys;
 * named here so callers reading clinical ELEMENTs don't have to remember the
 * numeric codes.
 */
export const NULL_FLAVOUR_CODE = {
  /** 253 — value is unknown. */
  UNKNOWN: "253",
  /** 271 — no information was supplied. */
  NO_INFORMATION: "271",
  /** 272 — value exists but is masked (e.g. consent / confidentiality). */
  MASKED: "272",
  /** 273 — a value is not applicable in this context. */
  NOT_APPLICABLE: "273",
} as const;

export type NullFlavourCode = (typeof NULL_FLAVOUR_CODE)[keyof typeof NULL_FLAVOUR_CODE];

// An ELEMENT for null-flavour inspection: a value may be absent, and a
// `null_flavour` (DV_CODED_TEXT) present. We read only those two fields, with a
// lenient schema (no `as`, per CLAUDE.md rule 3) — we are not re-validating the
// whole ELEMENT, just probing for the null-flavour signal. Input is `unknown`
// (consistent with the value formatters): callers may pass a parsed ELEMENT or a
// loosely-typed slice from a tree walk; the carrier validates either way.
const NullFlavourCarrier = z.object({
  value: z.unknown().optional(),
  null_flavour: z.object({ defining_code: z.object({ code_string: z.string() }) }).optional(),
});

/**
 * Whether an ELEMENT is null: it carries no `value` AND a `null_flavour` is
 * present. (An element with both a value and a null_flavour is not "null"; an
 * element with neither is simply empty, not flavoured-null.)
 */
export function isElementNull(element: unknown): boolean {
  const parsed = NullFlavourCarrier.safeParse(element);
  if (!parsed.success) return false;
  return parsed.data.value === undefined && parsed.data.null_flavour !== undefined;
}

/**
 * The null-flavour code on an ELEMENT (the `null_flavour.defining_code.code_string`),
 * or `null` when no null-flavour is present.
 */
export function nullFlavourCode(element: unknown): string | null {
  const parsed = NullFlavourCarrier.safeParse(element);
  if (!parsed.success || parsed.data.null_flavour === undefined) return null;
  return parsed.data.null_flavour.defining_code.code_string;
}

/**
 * The human-readable rubric for a null-flavour code (via the openEHR TERM
 * NULL_FLAVOURS group), or `null` for an unrecognised code.
 */
export function nullFlavourRubric(code: string): string | null {
  // NULL_FLAVOURS is keyed by the narrow NullFlavoursCode union; look the code up
  // by value-equality over its entries (no `as` narrowing of `string` → key,
  // per CLAUDE.md rule 3).
  for (const [knownCode, rubric] of Object.entries(NULL_FLAVOURS)) {
    if (knownCode === code) return rubric;
  }
  return null;
}

// ── Value formatters ───────────────────────────────────────────────────────

/**
 * Format a DV_QUANTITY as `"<magnitude> <units>"`, e.g. `"70.5 kg"`. When
 * `precision` is a non-negative integer, the magnitude is rendered to that many
 * decimal places (precision 0 → integer). Units are appended verbatim (openEHR
 * units are UCUM/display strings, already display-ready). Falls back to `""` on
 * malformed input.
 */
export function formatDvQuantity(dv: unknown): string {
  const parsed = z
    .object({
      magnitude: z.number(),
      units: z.string(),
      precision: z.number().int().nonnegative().optional(),
    })
    .safeParse(dv);
  if (!parsed.success) return "";
  const { magnitude, units, precision } = parsed.data;
  const num = precision === undefined ? String(magnitude) : magnitude.toFixed(precision);
  return units.length === 0 ? num : `${num} ${units}`;
}

/**
 * Format a DV_CODED_TEXT (or DV_TEXT-like) for display: prefer the human `value`
 * (rubric); otherwise fall back to the `defining_code.code_string`; otherwise
 * `""`.
 */
export function formatDvCodedText(dv: unknown): string {
  const parsed = z
    .object({
      value: z.string().optional(),
      defining_code: z.object({ code_string: z.string() }).optional(),
    })
    .safeParse(dv);
  if (!parsed.success) return "";
  const { value, defining_code } = parsed.data;
  if (value !== undefined && value.length > 0) return value;
  return defining_code?.code_string ?? "";
}

// openEHR ProportionKind (DV_PROPORTION.type): see RM Data Types.
const PROPORTION_KIND = {
  RATIO: 0,
  UNITARY: 1,
  PERCENT: 2,
  FRACTION: 3,
  INTEGER_FRACTION: 4,
} as const;

/**
 * Format a DV_PROPORTION. A `percent` kind (type 2) renders as `"<n>%"`; every
 * other kind renders as `"<numerator>/<denominator>"`. Falls back to `""` on
 * malformed input.
 */
export function formatDvProportion(dv: unknown): string {
  const parsed = z
    .object({
      numerator: z.number(),
      denominator: z.number(),
      type: z.number().int().optional(),
    })
    .safeParse(dv);
  if (!parsed.success) return "";
  const { numerator, denominator, type } = parsed.data;
  if (type === PROPORTION_KIND.PERCENT) return `${numerator}%`;
  return `${numerator}/${denominator}`;
}

/**
 * Format a DV_ORDINAL / DV_SCALE: the `symbol`'s display text (rubric, else
 * code). Falls back to the bare numeric `value`, else `""`.
 */
export function formatDvOrdinal(dv: unknown): string {
  const parsed = z
    .object({
      value: z.number().optional(),
      symbol: z
        .object({
          value: z.string().optional(),
          defining_code: z.object({ code_string: z.string() }).optional(),
        })
        .optional(),
    })
    .safeParse(dv);
  if (!parsed.success) return "";
  if (parsed.data.symbol !== undefined) {
    const symbol = formatDvCodedText(parsed.data.symbol);
    if (symbol.length > 0) return symbol;
  }
  return parsed.data.value === undefined ? "" : String(parsed.data.value);
}

/**
 * Display an ISO 8601 date for clinical surfaces. Accepts full or partial dates
 * (e.g. `"2020"`, `"2020-10"`, `"2020-10-26"`) and returns the string as-is
 * (already display-ready ISO). Falls back to `""` on malformed input.
 */
export function formatDvDate(value: unknown): string {
  const parsed = z.string().safeParse(value);
  if (!parsed.success) return "";
  return parsed.data.trim();
}

/** Display preferences for a clinically-significant timestamp. */
export interface FormatDvDateTimeOptions {
  /**
   * A timezone abbreviation (e.g. `"CET"`, `"UTC"`) to append after the ISO
   * value. architecture.md §12.2: clinically-significant timestamps display the
   * tz abbreviation; audit timestamps display UTC explicitly. The UI supplies
   * this from its locale/zone resolution — this function never derives it.
   */
  readonly timeZoneAbbr?: string;
}

/**
 * Display an ISO 8601 date-time for clinical surfaces. Returns the ISO value
 * as-is (it already carries its own UTC offset, per openEHR), optionally
 * suffixed with a timezone abbreviation supplied by the caller — e.g.
 * `"2020-10-26T15:39:53.668+01:00 CET"`. Handles partial date-times gracefully
 * (returned verbatim). Falls back to `""` on malformed input.
 */
export function formatDvDateTime(value: unknown, opts?: FormatDvDateTimeOptions): string {
  const parsed = z.string().safeParse(value);
  if (!parsed.success) return "";
  const iso = parsed.data.trim();
  if (iso.length === 0) return "";
  const abbr = opts?.timeZoneAbbr?.trim();
  return abbr !== undefined && abbr.length > 0 ? `${iso} ${abbr}` : iso;
}

// A PARTY_PROXY for display: PARTY_IDENTIFIED/PARTY_RELATED carry an optional
// `name` and optional `external_ref` ({ namespace, id: { value } }); every
// variant carries an optional `_type`. Lenient schema — we read only display
// fields, not re-validate the whole proxy.
const PartyProxyCarrier = z.object({
  name: z.string().optional(),
  external_ref: z
    .object({
      namespace: z.string(),
      id: z.object({ value: z.string() }),
    })
    .optional(),
  _type: z.string().optional(),
});

/**
 * Human-readable label for a PARTY_PROXY (composer / participation performer):
 *   1. the `name` (PARTY_IDENTIFIED / PARTY_RELATED), else
 *   2. the external reference as `"<namespace>:<id.value>"` (the M7 demographic
 *      pointer — Inviolable rule 12: parties are referenced, never inlined), else
 *   3. the `_type` (e.g. `"PARTY_SELF"`), else
 *   4. `""`.
 */
export function formatPartyProxy(party: unknown): string {
  const parsed = PartyProxyCarrier.safeParse(party);
  if (!parsed.success) return "";
  const { name, external_ref, _type } = parsed.data;
  if (name !== undefined && name.length > 0) return name;
  if (external_ref !== undefined) return `${external_ref.namespace}:${external_ref.id.value}`;
  return _type ?? "";
}
