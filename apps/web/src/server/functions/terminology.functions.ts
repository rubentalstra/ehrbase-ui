// createServerFn contract for external terminology lookups (ADR-0034; F2
// terminology provider). CLIENT-IMPORTABLE BOUNDARY: owns the input schemas +
// output types; the .server.ts beside it resolves the provider, role-gates,
// runs the Valkey cache, and never re-declares the shape (CLAUDE.md rules 7 + 8).
//
// Terminology is reference data, NOT PHI (ADR-0034): no audit, highly cacheable
// (1h TTL server-side). The DV_CODED_TEXT combobox in the FieldRenderer calls
// `expandValueSet` (debounced autocomplete); `lookupCode` resolves a display for
// a stored code (read views / pre-population).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Mirrors term-core's ExpandValueSetInput but client-safe (no provider import).
// `count` is capped low for the autocomplete path; at least one binding context
// (url or system) is required so the server has something to expand.
export const ExpandValueSetRequestSchema = z
  .object({
    url: z.string().min(1).max(2048).optional(),
    system: z.string().min(1).max(2048).optional(),
    filter: z.string().max(256).optional(),
    count: z.number().int().min(1).max(50).default(20),
    offset: z.number().int().min(0).default(0),
    displayLanguage: z.string().max(35).optional(),
  })
  .refine((v) => v.url !== undefined || v.system !== undefined, {
    message: "expandValueSet requires either `url` or `system`",
  });
export type ExpandValueSetRequest = z.infer<typeof ExpandValueSetRequestSchema>;

export const LookupCodeRequestSchema = z.object({
  system: z.string().min(1).max(2048),
  code: z.string().min(1).max(256),
  displayLanguage: z.string().max(35).optional(),
});
export type LookupCodeRequest = z.infer<typeof LookupCodeRequestSchema>;

export interface CodedOptionDto {
  system: string;
  code: string;
  display: string;
}
export interface ExpandValueSetResult {
  /** True when the active provider is NOT `none` — the UI shows a live combobox. */
  configured: boolean;
  options: CodedOptionDto[];
  total: number;
}
export interface LookupCodeResult {
  configured: boolean;
  display: string;
}

export const expandValueSet = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => ExpandValueSetRequestSchema.parse(d))
  .handler(async ({ data }): Promise<ExpandValueSetResult> => {
    const { runExpandValueSet } = await import("./terminology.server");
    return runExpandValueSet(data);
  });

export const lookupCode = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => LookupCodeRequestSchema.parse(d))
  .handler(async ({ data }): Promise<LookupCodeResult> => {
    const { runLookupCode } = await import("./terminology.server");
    return runLookupCode(data);
  });
