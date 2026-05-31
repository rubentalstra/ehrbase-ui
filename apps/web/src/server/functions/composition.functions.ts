// createServerFn contract for openEHR COMPOSITION CRUD (§7 write/read path,
// Tranche 1c). CLIENT-IMPORTABLE BOUNDARY: owns the input schemas + output
// types. The .server.ts beside it runs the form-state↔FLAT conversion + the
// audited EHRbase call; it never re-declares these shapes (CLAUDE.md rules 7+8).
//
// The composition's openEHR data (form-state / FLAT) crosses the wire as a JSON
// STRING for the same reason getWebTemplate does — the form-state type is an
// open JSON object (unknown leaf values) that doesn't satisfy createServerFn's
// serializable-return constraint, and the consumer re-validates it with
// generateFormSchema(template) on arrival (defense in depth). Inputs use
// z.json() (a precise, serializable JSON value type) for the form-state payload.
//
// Optimistic concurrency (§7, openEHR ITS-REST 1.0.3): reads/writes return the
// version_uid (object_id::system_id::version_tree_id); update/delete pass it back
// as If-Match. A stale write surfaces as a typed 412 CONFLICT (see callEhrbase).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ─── Input contracts ────────────────────────────────────────────────────────
export const WriteCompositionInputSchema = z.object({
  ehrId: z.uuid(),
  templateId: z.string().min(1),
  formState: z.json(),
});
export type WriteCompositionInput = z.infer<typeof WriteCompositionInputSchema>;

export const ReadCompositionInputSchema = z.object({
  ehrId: z.uuid(),
  templateId: z.string().min(1),
  compositionUid: z.string().min(1),
});
export type ReadCompositionInput = z.infer<typeof ReadCompositionInputSchema>;

export const UpdateCompositionInputSchema = z.object({
  ehrId: z.uuid(),
  templateId: z.string().min(1),
  compositionUid: z.string().min(1),
  // Full version_uid of the version being replaced (If-Match).
  versionUid: z.string().min(1),
  formState: z.json(),
});
export type UpdateCompositionInput = z.infer<typeof UpdateCompositionInputSchema>;

export const DeleteCompositionInputSchema = z.object({
  ehrId: z.uuid(),
  compositionUid: z.string().min(1),
  versionUid: z.string().min(1),
});
export type DeleteCompositionInput = z.infer<typeof DeleteCompositionInputSchema>;

// Canonical export — reads a composition in the CANONICAL (structured) openEHR
// JSON representation rather than FLAT. No templateId needed (EHRbase resolves
// the template from the stored composition).
export const ExportCompositionInputSchema = z.object({
  ehrId: z.uuid(),
  compositionUid: z.string().min(1),
});
export type ExportCompositionInput = z.infer<typeof ExportCompositionInputSchema>;

// ─── Output contracts ─────────────────────────────────────────────────────────
export interface WriteCompositionResult {
  versionUid: string;
}
// Update returns a DISCRIMINATED UNION rather than throwing on a stale write, so
// the optimistic-concurrency conflict-resolution flow (§7) is a first-class
// result the form can branch on — not a fragile thrown-error-message parse. On a
// 412 the typed CONFLICT from callEhrbase carries the current server etag, which
// becomes `currentVersionUid` (the latest version_uid the client must re-apply
// onto and retry). All OTHER errors still throw (auth/404/5xx).
export type UpdateCompositionResult =
  | { status: "ok"; versionUid: string }
  | { status: "conflict"; currentVersionUid: string | null };
export interface ReadCompositionResult {
  /** The form-state object as a JSON string; consumer parses + re-validates. */
  formState: string;
  versionUid: string;
}
export interface DeleteCompositionResult {
  deleted: true;
}
export interface ExportCompositionResult {
  /**
   * The canonical openEHR COMPOSITION as a (pretty-printed) JSON string, ready
   * for download. A string for the same serializable-return reason as the FLAT
   * read path (the canonical object is open JSON with `unknown` leaves).
   */
  canonical: string;
  versionUid: string;
}

// ─── Server fns ───────────────────────────────────────────────────────────────
export const writeComposition = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => WriteCompositionInputSchema.parse(d))
  .handler(async ({ data }): Promise<WriteCompositionResult> => {
    const { createComposition } = await import("./composition.server");
    return createComposition(data);
  });

export const readComposition = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => ReadCompositionInputSchema.parse(d))
  .handler(async ({ data }): Promise<ReadCompositionResult> => {
    const { fetchComposition } = await import("./composition.server");
    return fetchComposition(data);
  });

export const updateComposition = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => UpdateCompositionInputSchema.parse(d))
  .handler(async ({ data }): Promise<UpdateCompositionResult> => {
    const { reviseComposition } = await import("./composition.server");
    return reviseComposition(data);
  });

export const deleteComposition = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => DeleteCompositionInputSchema.parse(d))
  .handler(async ({ data }): Promise<DeleteCompositionResult> => {
    const { removeComposition } = await import("./composition.server");
    return removeComposition(data);
  });

export const exportComposition = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => ExportCompositionInputSchema.parse(d))
  .handler(async ({ data }): Promise<ExportCompositionResult> => {
    const { exportCompositionCanonical } = await import("./composition.server");
    return exportCompositionCanonical(data);
  });
