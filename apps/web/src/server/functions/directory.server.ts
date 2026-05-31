// Server-only EHR DIRECTORY (FOLDER tree) against EHRbase (openEHR ITS-REST
// 1.0.3 §DIRECTORY). Wraps:
//   fetchDirectory  → GET  ehr/{id}/directory[?path=…|&version_at_time=…]
//   addDirectory    → POST ehr/{id}/directory               (root FOLDER body)
//   reviseDirectory → PUT  ehr/{id}/directory  (If-Match version_uid)
// Every call goes through callEhrbase (auth + rate-limit + 404/403 conflation +
// typed 412). Contract/types live in directory.functions.ts (CLAUDE.md rules 7+8).

import { z } from "zod";

import { callEhrbase, type EhrbaseOk } from "@/server/bff/call-ehrbase.server";
import { getEhrbaseContext, type EhrbaseContext } from "@/server/bff/ehrbase-context.server";

import type {
  CreateDirectoryInput,
  DirectoryWriteResult,
  GetDirectoryInput,
  GetDirectoryResult,
  UpdateDirectoryInput,
} from "./directory.functions";

const JSON_MEDIA_TYPE = "application/json";
// Static classification path — never carries user ids (classifyRequest maps
// "directory" → FOLDER resource).
const CLASSIFY_PATH = "ehr/directory";

function fail(status: number, code: string): Response {
  return new Response(JSON.stringify({ code }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function requireContext(): Promise<EhrbaseContext> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const ctx = await getEhrbaseContext(getRequest().headers);
  if (!ctx) throw fail(401, "UNAUTHENTICATED");
  return ctx;
}

// version_uid = object_id::system_id::version_tree_id, returned (double-quoted)
// in the ETag on directory read/write.
function versionUidFrom(res: EhrbaseOk): string {
  if (res.etag) return res.etag.replace(/^"|"$/gu, "");
  const seg = res.location?.split("/").pop();
  if (seg) return decodeURIComponent(seg);
  throw fail(502, "NO_VERSION_UID");
}

// The canonical FOLDER body is arbitrary openEHR JSON — keep it opaque for the
// tree viewer; only assert "parseable JSON" defensively.
const JsonValueSchema = z.json();
function parseJsonBody(json: unknown): z.infer<typeof JsonValueSchema> {
  const parsed = JsonValueSchema.safeParse(json);
  if (!parsed.success) throw fail(502, "BAD_DIRECTORY_RESULT");
  return parsed.data;
}

function directorySearch(input: GetDirectoryInput): string {
  const params = new URLSearchParams();
  if (input.versionAtTime) params.set("version_at_time", input.versionAtTime);
  if (input.path) params.set("path", input.path);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchDirectory(input: GetDirectoryInput): Promise<GetDirectoryResult> {
  const ctx = await requireContext();
  const res = await callEhrbase(ctx, {
    method: "GET",
    path: `ehr/${encodeURIComponent(input.ehrId)}/directory`,
    classifyPath: CLASSIFY_PATH,
    accept: JSON_MEDIA_TYPE,
    ...(directorySearch(input) ? { search: directorySearch(input) } : {}),
  });
  // A path / version_at_time read may not carry an ETag → version_uid is optional.
  return {
    folder: parseJsonBody(res.json),
    versionUid: res.etag ? res.etag.replace(/^"|"$/gu, "") : null,
  };
}

export async function addDirectory(input: CreateDirectoryInput): Promise<DirectoryWriteResult> {
  const ctx = await requireContext();
  const res = await callEhrbase(ctx, {
    method: "POST",
    path: `ehr/${encodeURIComponent(input.ehrId)}/directory`,
    classifyPath: CLASSIFY_PATH,
    contentType: JSON_MEDIA_TYPE,
    accept: JSON_MEDIA_TYPE,
    body: JSON.stringify(input.folder),
  });
  return { versionUid: versionUidFrom(res) };
}

export async function reviseDirectory(input: UpdateDirectoryInput): Promise<DirectoryWriteResult> {
  const ctx = await requireContext();
  const res = await callEhrbase(ctx, {
    method: "PUT",
    path: `ehr/${encodeURIComponent(input.ehrId)}/directory`,
    classifyPath: CLASSIFY_PATH,
    contentType: JSON_MEDIA_TYPE,
    accept: JSON_MEDIA_TYPE,
    // openEHR ITS-REST mandates the double-quoted version_uid in If-Match for the
    // canonical directory endpoint (like EHR_STATUS, not the bare-value FLAT
    // composition quirk). Re-verify against the live stack.
    ifMatch: `"${input.versionUid}"`,
    body: JSON.stringify(input.folder),
  });
  return { versionUid: versionUidFrom(res) };
}
