// createServerFn contract for fetching an operational web template (§7 form
// pipeline, Tranche 1b). CLIENT-IMPORTABLE BOUNDARY: owns the input schema +
// output type; the .server.ts beside it runs the fetch + Valkey cache + audit
// and never re-declares the shape (CLAUDE.md rules 7 + 8).
//
// Returns the validated web template as a JSON STRING. Two reasons: (1) the
// WebTemplate type (permissive z.looseObject + z.unknown defaultValue) carries
// an `unknown` index signature that doesn't satisfy createServerFn's
// serializable-return constraint; (2) the consumer re-validates with
// parseWebTemplate(JSON.parse(result)) — defense-in-depth at the boundary.
// The consumer then calls generateFormSchema(template) (a runtime z.ZodType,
// which is itself non-serialisable so never crosses the wire).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const TemplateRequestSchema = z.object({
  templateId: z.string().min(1),
});
export type TemplateRequest = z.infer<typeof TemplateRequestSchema>;

// OPT upload input (Part C Phase 1 — engine-first workbench). The body is the
// raw operational-template XML string; non-empty is the only contract we can
// assert client-side (EHRbase validates the ADL 1.4 OPT itself).
export const UploadTemplateInputSchema = z.object({
  opt: z.string().trim().min(1),
});
export type UploadTemplateInput = z.infer<typeof UploadTemplateInputSchema>;

// A lenient summary of one entry in the template list. EHRbase returns the
// DEFINITION-layer template metadata; we model only the fields the workbench
// renders and keep them all optional bar the id.
export interface TemplateSummary {
  templateId: string;
  conceptName: string | null;
  createdTimestamp: string | null;
}
export interface UploadTemplateResult {
  templateId: string;
}

export const listTemplates = createServerFn({ method: "GET" })
  .handler(async (): Promise<TemplateSummary[]> => {
    const { fetchTemplateList } = await import("./template.server");
    return fetchTemplateList();
  });

export const uploadTemplate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => UploadTemplateInputSchema.parse(d))
  .handler(async ({ data }): Promise<UploadTemplateResult> => {
    const { storeTemplate } = await import("./template.server");
    return storeTemplate(data);
  });

export const getWebTemplate = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => TemplateRequestSchema.parse(d))
  .handler(async ({ data }): Promise<string> => {
    const { fetchWebTemplate } = await import("./template.server");
    return JSON.stringify(await fetchWebTemplate(data));
  });
