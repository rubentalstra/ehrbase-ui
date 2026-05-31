// TerminologyProvider — the interface every external-terminology adapter
// implements (ADR-0034), plus the canonical, PROVIDER-INDEPENDENT types the rest
// of the app speaks. Mirrors the demographic-provider shape (ADR-0031): one
// interface, capability flags, adapters translate to/from their backend.
//
// The wire shape is the FHIR R4 Terminology Service (ADR-0034): every adapter
// speaks FHIR — Snowstorm exposes a FHIR endpoint natively; the generic adapter
// targets any R4-compliant `tx` server. The app never sees adapter-specific
// payloads — only the canonical `CodedOption` projection below.
//
// SCOPE (F2): the three operations the dynamic form pipeline needs to bind a
// DV_CODED_TEXT field to an EXTERNAL value set —
//   - expandValueSet  → ValueSet/$expand     (autocomplete the picker)
//   - lookup          → CodeSystem/$lookup    (resolve a display for a code)
//   - validateCode    → ValueSet/$validate-code (membership check)
// `$translate` (ConceptMap) is deliberately out of scope for v1.0 foundation;
// the ADR's broader sketch is reserved for the milestone that needs mapping.

import { z } from "zod";

// ─── CodedOption — the canonical, provider-independent coded value ─────────────
// This is what the picker renders and what the FLAT converter ultimately needs
// to emit `|code` + `|value` + `|terminology` for a DV_CODED_TEXT (the form-state
// shape `{ code, value, terminology }` — see apps/web field-renderer).
export const CodedOptionSchema = z.object({
  /** The code system URI (e.g. "http://snomed.info/sct"). */
  system: z.string().min(1),
  /** The concept code within that system. */
  code: z.string().min(1),
  /** The human-readable display for the concept. */
  display: z.string().min(1),
});
export type CodedOption = z.infer<typeof CodedOptionSchema>;

// A localized designation returned by $lookup (e.g. an alternate language term).
export const DesignationSchema = z.object({
  language: z.string().optional(),
  value: z.string().min(1),
});
export type Designation = z.infer<typeof DesignationSchema>;

// ─── Operation inputs ──────────────────────────────────────────────────────────
// ValueSet/$expand: either an intensional `url` (a ValueSet canonical URL) OR a
// `system` (expand an entire CodeSystem) — at least one is required so the server
// has something to expand. `filter` is the autocomplete text the clinician typed.
export const ExpandValueSetInputSchema = z
  .object({
    /** Canonical ValueSet URL to expand (the binding's value set). */
    url: z.string().min(1).optional(),
    /** CodeSystem URL to expand when no ValueSet URL is bound. */
    system: z.string().min(1).optional(),
    /** Text filter — the autocomplete query (FHIR `$expand` `filter`). */
    filter: z.string().optional(),
    /** Max options to return (FHIR `count`). */
    count: z.number().int().min(1).max(100).default(20),
    /** Offset into the expansion (FHIR `offset`). */
    offset: z.number().int().min(0).default(0),
    /** BCP-47 display language (Snowstorm `_displayLanguage`). */
    displayLanguage: z.string().optional(),
  })
  .refine((v) => v.url !== undefined || v.system !== undefined, {
    message: "expandValueSet requires either `url` or `system`",
  });
export type ExpandValueSetInput = z.infer<typeof ExpandValueSetInputSchema>;

export interface ExpandResult {
  options: CodedOption[];
  /** Total matches (FHIR expansion.total); may exceed options.length when paged. */
  total: number;
}

export const LookupInputSchema = z.object({
  system: z.string().min(1),
  code: z.string().min(1),
  displayLanguage: z.string().optional(),
});
export type LookupInput = z.infer<typeof LookupInputSchema>;

export interface LookupResult {
  display: string;
  designations: Designation[];
}

// ValueSet/$validate-code: validate a code against a bound value set (preferred)
// or against its code system. At least one binding context is required.
export const ValidateCodeInputSchema = z
  .object({
    code: z.string().min(1),
    system: z.string().min(1).optional(),
    valueSetUrl: z.string().min(1).optional(),
    displayLanguage: z.string().optional(),
  })
  .refine((v) => v.system !== undefined || v.valueSetUrl !== undefined, {
    message: "validateCode requires either `system` or `valueSetUrl`",
  });
export type ValidateCodeInput = z.infer<typeof ValidateCodeInputSchema>;

// ─── Capabilities ──────────────────────────────────────────────────────────────
// Mirrors DemographicProviderCapabilities. `configured=false` is the `none`
// provider — the UI shows a "terminology not configured" hint and the picker
// stays a plain text input (graceful degradation, ADR-0034).
export interface TerminologyProviderCapabilities {
  /** False for the `none` provider → UI degrades to a plain text field. */
  configured: boolean;
  /** ValueSet/$expand is available (autocomplete). */
  supportsExpand: boolean;
  /** ValueSet/$validate-code is available. */
  supportsValidate: boolean;
  /** CodeSystem/$lookup is available (display resolution). */
  supportsLookup: boolean;
  /** SNOMED CT Expression Constraint Language (Snowstorm-specific). */
  supportsSnomedEcl: boolean;
  /** BCP-47 locales the server advertises for display text. */
  locales: string[];
}

export interface TerminologyProvider {
  /** Adapter name (e.g. "snowstorm", "generic-fhir", "none"). */
  readonly name: string;
  readonly capabilities: TerminologyProviderCapabilities;

  /** ValueSet/$expand — autocomplete a coded picker. */
  expandValueSet(input: ExpandValueSetInput): Promise<ExpandResult>;
  /** CodeSystem/$lookup — resolve the display (+ designations) for a code. */
  lookup(input: LookupInput): Promise<LookupResult>;
  /** ValueSet/$validate-code — is the code a member of the bound value set? */
  validateCode(input: ValidateCodeInput): Promise<boolean>;
}
