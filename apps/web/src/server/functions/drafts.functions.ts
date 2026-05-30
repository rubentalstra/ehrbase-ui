// createServerFn contract for encrypted draft autosave (§7 form pipeline,
// Tranche 1d). CLIENT-IMPORTABLE BOUNDARY: owns the input schemas + output
// types; drafts.server.ts runs the AES-256-GCM encrypt + Valkey store + audit.
//
// A draft is the user's in-progress, not-yet-committed composition form-state.
// It is held in Valkey (24h TTL), ENCRYPTED at rest (it is PHI), keyed by
// user+template+ehr. On mount the form resumes-or-discards; on commit (the 1c
// composition write) the draft is deleted. The form-state crosses the wire as a
// JSON string (same boundary rationale as getWebTemplate/composition) — the
// consumer re-validates with generateFormSchema(template).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const DraftKeyInputSchema = z.object({
  templateId: z.string().min(1),
  ehrId: z.uuid(),
});
export type DraftKeyInput = z.infer<typeof DraftKeyInputSchema>;

export const SaveDraftInputSchema = DraftKeyInputSchema.extend({
  formState: z.json(),
});
export type SaveDraftInput = z.infer<typeof SaveDraftInputSchema>;

export interface SaveDraftResult {
  savedAt: string;
}
export interface GetDraftResult {
  /** Decrypted form-state as a JSON string, or null when no draft exists. */
  formState: string | null;
  savedAt: string | null;
}
export interface DiscardDraftResult {
  deleted: boolean;
}

export const saveDraft = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SaveDraftInputSchema.parse(d))
  .handler(async ({ data }): Promise<SaveDraftResult> => {
    const { storeDraft } = await import("./drafts.server");
    return storeDraft(data);
  });

export const getDraft = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => DraftKeyInputSchema.parse(d))
  .handler(async ({ data }): Promise<GetDraftResult> => {
    const { readDraft } = await import("./drafts.server");
    return readDraft(data);
  });

export const discardDraft = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => DraftKeyInputSchema.parse(d))
  .handler(async ({ data }): Promise<DiscardDraftResult> => {
    const { removeDraft } = await import("./drafts.server");
    return removeDraft(data);
  });
