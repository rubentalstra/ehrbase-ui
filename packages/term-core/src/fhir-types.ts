// Minimal Zod schemas for the FHIR R4 Terminology Service response subset the
// adapters read: the ValueSet/$expand `expansion`, and the `Parameters` resource
// returned by CodeSystem/$lookup + ValueSet/$validate-code. Responses are PARSED
// through these before crossing into the app (no unvalidated data crosses the
// boundary — §15). Unknown fields are stripped (default Zod behaviour); we never
// claim full FHIR conformance (ADR-0034 — the R4 Terminology Service subset only).
//
// Reuses the same hand-rolled-Zod FHIR typing approach as demographic-adapter-fhir
// (NO third-party FHIR SDK on the dependency graph — ADR-0030, rule 5).

import { z } from "zod";

// ── ValueSet/$expand → ValueSet with an `expansion.contains[]` ────────────────
export const FhirValueSetContainsSchema = z.object({
  system: z.string().optional(),
  code: z.string().optional(),
  display: z.string().optional(),
});
export type FhirValueSetContains = z.infer<typeof FhirValueSetContainsSchema>;

export const FhirExpansionSchema = z.object({
  total: z.number().optional(),
  offset: z.number().optional(),
  contains: z.array(FhirValueSetContainsSchema).optional(),
});

export const FhirValueSetSchema = z.object({
  resourceType: z.literal("ValueSet"),
  url: z.string().optional(),
  expansion: FhirExpansionSchema.optional(),
});
export type FhirValueSet = z.infer<typeof FhirValueSetSchema>;

// ── Parameters (returned by $lookup and $validate-code) ───────────────────────
// `$lookup` returns name/value parameters (`display`, plus `designation` parts);
// `$validate-code` returns a `result` boolean. A Parameters part can nest `part`
// (designations), so the schema is recursive via a Zod getter (same technique as
// the web-template node tree).
export const FhirParametersParameterSchema = z.object({
  name: z.string(),
  valueString: z.string().optional(),
  valueBoolean: z.boolean().optional(),
  valueCode: z.string().optional(),
  get part() {
    return z.array(FhirParametersParameterSchema).optional();
  },
});
export type FhirParametersParameter = z.infer<typeof FhirParametersParameterSchema>;

export const FhirParametersSchema = z.object({
  resourceType: z.literal("Parameters"),
  parameter: z.array(FhirParametersParameterSchema).optional(),
});
export type FhirParameters = z.infer<typeof FhirParametersSchema>;
