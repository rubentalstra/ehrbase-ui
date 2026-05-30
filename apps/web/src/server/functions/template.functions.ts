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

export const getWebTemplate = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => TemplateRequestSchema.parse(d))
  .handler(async ({ data }): Promise<string> => {
    const { fetchWebTemplate } = await import("./template.server");
    return JSON.stringify(await fetchWebTemplate(data));
  });
