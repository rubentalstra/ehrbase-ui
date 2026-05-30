// Server-only openEHR COMPOSITION CRUD (§7 write/read path, Tranche 1c).
//
// Bridges the §7 form pipeline to EHRbase over the FLAT (simSDT) format:
//   form-state ──formStateToFlat(template)──▶ POST/PUT …/composition?format=FLAT
//   form-state ◀──flatToFormState(template)── GET  …/composition/{uid}?format=FLAT
// Every call goes through callEhrbase (auth + rate-limit + dual-layer audit +
// 404/403 conflation + typed 412 — ADR-0024). Form-state is re-validated server
// side with the template's generated schema BEFORE conversion (§15 — clinical
// data must not cross the boundary unvalidated). Contract/types live in
// composition.functions.ts (CLAUDE.md rules 7+8).

import { formStateToFlat, flatToFormState, type FlatComposition } from "@ehrbase-ui/openehr-flat";
import { generateFormSchema } from "@ehrbase-ui/openehr-web-template";
import { z } from "zod";

import { callEhrbase, type EhrbaseOk } from "@/server/bff/call-ehrbase.server";
import { getEhrbaseContext, type EhrbaseContext } from "@/server/bff/ehrbase-context.server";

import type {
  DeleteCompositionInput,
  DeleteCompositionResult,
  ReadCompositionInput,
  ReadCompositionResult,
  UpdateCompositionInput,
  WriteCompositionInput,
  WriteCompositionResult,
} from "./composition.functions";
import { loadWebTemplate } from "./template.server";

// EHRbase FLAT (web-template simplified) media type (openEHR ITS-REST 1.0.3).
const FLAT_CONTENT_TYPE = "application/openehr.wt.flat+json";
// Static classification path — never carries user ids (audit-trail integrity).
const CLASSIFY_PATH = "composition";

// EHRbase returns the FLAT composition as a flat key/value map.
const FlatResponseSchema = z.record(z.string(), z.unknown());

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

// version_uid = object_id::system_id::version_tree_id. EHRbase returns it in the
// (double-quoted) ETag on write + read; Location is the fallback on create.
function versionUidFrom(res: EhrbaseOk): string {
  if (res.etag) return res.etag.replace(/^"|"$/gu, "");
  const seg = res.location?.split("/").pop();
  if (seg) return decodeURIComponent(seg);
  throw fail(502, "NO_VERSION_UID");
}

// Validate form-state against the template's generated schema, then convert to
// FLAT. A schema miss is a generic 422 — never echo the (PHI-bearing) detail.
function toFlatBody(template: Parameters<typeof formStateToFlat>[0], formState: unknown): string {
  const parsed = generateFormSchema(template).safeParse(formState);
  if (!parsed.success) throw fail(422, "INVALID_FORM_STATE");
  return JSON.stringify(formStateToFlat(template, parsed.data));
}

export async function createComposition(
  input: WriteCompositionInput,
): Promise<WriteCompositionResult> {
  const ctx = await requireContext();
  const template = await loadWebTemplate(ctx, input.templateId);
  const body = toFlatBody(template, input.formState);

  const res = await callEhrbase(ctx, {
    method: "POST",
    path: `ehr/${input.ehrId}/composition`,
    classifyPath: CLASSIFY_PATH,
    search: "?format=FLAT",
    contentType: FLAT_CONTENT_TYPE,
    accept: FLAT_CONTENT_TYPE,
    body,
  });
  return { versionUid: versionUidFrom(res) };
}

export async function fetchComposition(
  input: ReadCompositionInput,
): Promise<ReadCompositionResult> {
  const ctx = await requireContext();
  const template = await loadWebTemplate(ctx, input.templateId);

  const res = await callEhrbase(ctx, {
    method: "GET",
    path: `ehr/${input.ehrId}/composition/${encodeURIComponent(input.compositionUid)}`,
    classifyPath: CLASSIFY_PATH,
    search: "?format=FLAT",
    accept: FLAT_CONTENT_TYPE,
  });

  const flat: FlatComposition = FlatResponseSchema.parse(res.json);
  const formState = flatToFormState(template, flat);
  // JSON-string boundary (see composition.functions.ts): the consumer parses +
  // re-validates with generateFormSchema(template).
  return { formState: JSON.stringify(formState), versionUid: versionUidFrom(res) };
}

export async function reviseComposition(
  input: UpdateCompositionInput,
): Promise<WriteCompositionResult> {
  const ctx = await requireContext();
  const template = await loadWebTemplate(ctx, input.templateId);
  const body = toFlatBody(template, input.formState);

  const res = await callEhrbase(ctx, {
    method: "PUT",
    path: `ehr/${input.ehrId}/composition/${encodeURIComponent(input.compositionUid)}`,
    classifyPath: CLASSIFY_PATH,
    search: "?format=FLAT",
    contentType: FLAT_CONTENT_TYPE,
    accept: FLAT_CONTENT_TYPE,
    ifMatch: `"${input.versionUid}"`,
    body,
  });
  return { versionUid: versionUidFrom(res) };
}

export async function removeComposition(
  input: DeleteCompositionInput,
): Promise<DeleteCompositionResult> {
  const ctx = await requireContext();
  await callEhrbase(ctx, {
    method: "DELETE",
    path: `ehr/${input.ehrId}/composition/${encodeURIComponent(input.compositionUid)}`,
    classifyPath: CLASSIFY_PATH,
    ifMatch: `"${input.versionUid}"`,
  });
  return { deleted: true };
}
