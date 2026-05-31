// createServerFn contract for the VERSIONED_COMPOSITION read surface (openEHR
// ITS-REST 1.0.3 §VERSIONED_COMPOSITION). Exposes the version-control history of
// a single composition object: the VERSIONED_COMPOSITION container, its
// REVISION_HISTORY, and a point-in-time VERSION. CLIENT-IMPORTABLE BOUNDARY:
// owns the input schemas + output types; the .server.ts beside it makes the
// EHRbase call (CLAUDE.md rules 7+8).
//
// The canonical bodies (VERSIONED_COMPOSITION / REVISION_HISTORY / VERSION) are
// open openEHR JSON objects whose leaves are `unknown` — they don't satisfy
// createServerFn's serializable-return constraint, so each crosses the wire as a
// JsonValue (the concrete recursive JSON type reused from query.functions.ts).
// The consumer renders them read-only (no re-conversion needed here).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Reuse the concrete serialisable JSON value type (see query.functions.ts) so
// arbitrary openEHR JSON satisfies createServerFn's return constraint.
export type { JsonValue } from "./query.functions";
import type { JsonValue } from "./query.functions";

export const VersionedObjectInputSchema = z.object({
  ehrId: z.uuid(),
  // The versioned object uid = the bare object_id of the composition (no
  // ::system::version suffix). EHRbase rejects a full version_uid here.
  versionedObjectUid: z.string().min(1),
});
export type VersionedObjectInput = z.infer<typeof VersionedObjectInputSchema>;

export const VersionAtTimeInputSchema = z.object({
  ehrId: z.uuid(),
  versionedObjectUid: z.string().min(1),
  // ISO-8601 timestamp; when omitted EHRbase returns the latest VERSION.
  versionAtTime: z.string().min(1).optional(),
});
export type VersionAtTimeInput = z.infer<typeof VersionAtTimeInputSchema>;

// ─── Output contracts ─────────────────────────────────────────────────────────
export interface VersionedCompositionResult {
  /** The VERSIONED_COMPOSITION canonical object. */
  versionedComposition: JsonValue;
}
export interface RevisionHistoryResult {
  /** The REVISION_HISTORY canonical object (array of REVISION_HISTORY_ITEM). */
  revisionHistory: JsonValue;
}
export interface VersionAtTimeResult {
  /** The ORIGINAL_VERSION (or null when no version exists at that time). */
  version: JsonValue;
}

// ─── Server fns ───────────────────────────────────────────────────────────────
export const getVersionedComposition = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => VersionedObjectInputSchema.parse(d))
  .handler(async ({ data }): Promise<VersionedCompositionResult> => {
    const { fetchVersionedComposition } = await import("./version.server");
    return fetchVersionedComposition(data);
  });

export const getCompositionRevisionHistory = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => VersionedObjectInputSchema.parse(d))
  .handler(async ({ data }): Promise<RevisionHistoryResult> => {
    const { fetchRevisionHistory } = await import("./version.server");
    return fetchRevisionHistory(data);
  });

export const getCompositionAtTime = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => VersionAtTimeInputSchema.parse(d))
  .handler(async ({ data }): Promise<VersionAtTimeResult> => {
    const { fetchVersionAtTime } = await import("./version.server");
    return fetchVersionAtTime(data);
  });
