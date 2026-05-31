// createServerFn contract for the EHR DIRECTORY (FOLDER tree) — openEHR
// ITS-REST 1.0.3 §DIRECTORY. An EHR has at most ONE directory: a root FOLDER
// whose sub-folders organise the compositions in that EHR. CLIENT-IMPORTABLE
// BOUNDARY: owns the input schemas + output types; the .server.ts beside it
// makes the EHRbase call (CLAUDE.md rules 7+8).
//
// The FOLDER body is canonical openEHR JSON (open object, `unknown` leaves), so
// it crosses the wire as a JSON STRING on the way in (z.json) and a JsonValue on
// the way out (the concrete serialisable JSON type reused from query.functions).
// Optimistic concurrency: read/create return the directory version_uid; update
// passes it back as If-Match (canonical endpoint → double-quoted, like
// EHR_STATUS — re-verify against the live stack).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { JsonValue } from "./query.functions";
import type { JsonValue } from "./query.functions";

export const GetDirectoryInputSchema = z.object({
  ehrId: z.uuid(),
  // Optional point-in-time read of the directory (ISO-8601). When omitted the
  // latest directory version is returned.
  versionAtTime: z.string().min(1).optional(),
  // Optional path INTO the directory tree (e.g. `episodes/2026`) to fetch a
  // sub-folder rather than the whole root.
  path: z.string().min(1).optional(),
});
export type GetDirectoryInput = z.infer<typeof GetDirectoryInputSchema>;

export const CreateDirectoryInputSchema = z.object({
  ehrId: z.uuid(),
  // The root FOLDER canonical JSON.
  folder: z.json(),
});
export type CreateDirectoryInput = z.infer<typeof CreateDirectoryInputSchema>;

export const UpdateDirectoryInputSchema = z.object({
  ehrId: z.uuid(),
  // Full version_uid of the directory FOLDER version being replaced (If-Match).
  versionUid: z.string().min(1),
  folder: z.json(),
});
export type UpdateDirectoryInput = z.infer<typeof UpdateDirectoryInputSchema>;

// ─── Output contracts ─────────────────────────────────────────────────────────
export interface GetDirectoryResult {
  /** The root (or sub-path) FOLDER canonical object. */
  folder: JsonValue;
  /** Present on a full read; a path/version_at_time read may not carry an ETag. */
  versionUid: string | null;
}
export interface DirectoryWriteResult {
  versionUid: string;
}

// ─── Server fns ───────────────────────────────────────────────────────────────
export const getDirectory = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => GetDirectoryInputSchema.parse(d))
  .handler(async ({ data }): Promise<GetDirectoryResult> => {
    const { fetchDirectory } = await import("./directory.server");
    return fetchDirectory(data);
  });

export const createDirectory = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => CreateDirectoryInputSchema.parse(d))
  .handler(async ({ data }): Promise<DirectoryWriteResult> => {
    const { addDirectory } = await import("./directory.server");
    return addDirectory(data);
  });

export const updateDirectory = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => UpdateDirectoryInputSchema.parse(d))
  .handler(async ({ data }): Promise<DirectoryWriteResult> => {
    const { reviseDirectory } = await import("./directory.server");
    return reviseDirectory(data);
  });
