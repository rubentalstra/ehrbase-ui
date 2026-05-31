// Server-only openEHR COMPOSITION CRUD (§7 write/read path, Tranche 1c).
//
// Bridges the §7 form pipeline to EHRbase over the FLAT (simSDT) format:
//   form-state ──formStateToFlat(template)──▶ POST/PUT …/composition?format=FLAT
//   form-state ◀──flatToFormState(template)── GET  …/composition/{uid}?format=FLAT
// Every call goes through callEhrbase (auth + rate-limit + 404/403 conflation +
// typed 412). Form-state is re-validated server side with the template's
// generated schema BEFORE conversion (§15 — clinical data must not cross the
// boundary unvalidated). Contract/types live in composition.functions.ts
// (CLAUDE.md rules 7+8).

import { formStateToFlat, flatToFormState, type FlatComposition } from "@ehrbase-ui/openehr-flat";
import { generateFormSchema } from "@ehrbase-ui/openehr-web-template";
import { z } from "zod";

import { callEhrbase, type EhrbaseOk } from "@/server/bff/call-ehrbase.server";
import { getEhrbaseContext, type EhrbaseContext } from "@/server/bff/ehrbase-context.server";

import type {
  DeleteCompositionInput,
  DeleteCompositionResult,
  ExportCompositionInput,
  ExportCompositionResult,
  ReadCompositionInput,
  ReadCompositionResult,
  UpdateCompositionInput,
  UpdateCompositionResult,
  WriteCompositionInput,
  WriteCompositionResult,
} from "./composition.functions";
import { loadWebTemplate } from "./template.server";

// EHRbase 2.31 FLAT contract (verified live 2026-05-30, scripts/dev/
// ehrbase-composition-probe.sh): the FLAT body is sent/received as
// `application/json` with the `?format=FLAT` query param — EHRbase 2.31 REJECTS
// `application/openehr.wt.flat+json` on the composition endpoint with 415. The
// flat body does NOT carry the template id, so write/update MUST pass it as the
// `&templateId=<template_id>` query param or EHRbase throws SdkException
// "Template null not found" (HTTP 500).
const FLAT_MEDIA_TYPE = "application/json";
// Static classification path — never carries user ids (audit-trail integrity).
const CLASSIFY_PATH = "composition";

// Build the FLAT search string. Write/update need templateId; read does not
// (EHRbase resolves the template from the stored composition).
function flatSearch(templateId?: string): string {
  return templateId
    ? `?format=FLAT&templateId=${encodeURIComponent(templateId)}`
    : "?format=FLAT";
}

// EHRbase returns the FLAT composition as a flat key/value map.
const FlatResponseSchema = z.record(z.string(), z.unknown());

// The typed 412 CONFLICT body callEhrbase throws (see call-ehrbase.server):
// { code: "CONFLICT", etag?: string }. Parse it to recover the current etag.
const ConflictBodySchema = z.object({ code: z.literal("CONFLICT"), etag: z.string().optional() });

// Recognise the typed 412 thrown by callEhrbase and recover the current
// version_uid (the etag, de-quoted). Returns null when the thrown value is NOT a
// 412 conflict — the caller re-throws those untouched. Returns
// { currentVersionUid } when it IS a conflict (etag may itself be absent).
async function conflictVersionUid(
  err: unknown,
): Promise<{ currentVersionUid: string | null } | null> {
  if (!(err instanceof Response) || err.status !== 412) return null;
  try {
    const parsed = ConflictBodySchema.safeParse(await err.clone().json());
    const etag = parsed.success ? parsed.data.etag : undefined;
    return { currentVersionUid: etag ? etag.replace(/^"|"$/gu, "") : null };
  } catch {
    return { currentVersionUid: null };
  }
}

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

// version_uid = object_id::system_id::version_tree_id. EHRbase returns the FULL
// triple in the (double-quoted) ETag on write + read — that is the source of
// truth for optimistic concurrency. NB the Location header carries only the bare
// object_id (no ::system::ver), so it is a last-resort fallback only.
function versionUidFrom(res: EhrbaseOk): string {
  if (res.etag) return res.etag.replace(/^"|"$/gu, "");
  const seg = res.location?.split("/").pop();
  if (seg) return decodeURIComponent(seg);
  throw fail(502, "NO_VERSION_UID");
}

// Validate form-state against the template's generated schema, then convert to
// FLAT. Returns null on a schema miss (the caller throws a generic 422 — the
// PHI-bearing detail is never echoed).
function toFlatBody(template: Parameters<typeof formStateToFlat>[0], formState: unknown): string | null {
  const parsed = generateFormSchema(template).safeParse(formState);
  if (!parsed.success) return null;
  return JSON.stringify(formStateToFlat(template, parsed.data));
}

export async function createComposition(
  input: WriteCompositionInput,
): Promise<WriteCompositionResult> {
  const ctx = await requireContext();
  const template = await loadWebTemplate(ctx, input.templateId);
  const body = toFlatBody(template, input.formState);
  if (body === null) throw fail(422, "INVALID_FORM_STATE");

  const res = await callEhrbase(ctx, {
    method: "POST",
    path: `ehr/${input.ehrId}/composition`,
    classifyPath: CLASSIFY_PATH,
    search: flatSearch(input.templateId),
    contentType: FLAT_MEDIA_TYPE,
    accept: FLAT_MEDIA_TYPE,
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
    search: flatSearch(),
    accept: FLAT_MEDIA_TYPE,
  });

  const flat: FlatComposition = FlatResponseSchema.parse(res.json);
  const formState = flatToFormState(template, flat);
  // JSON-string boundary (see composition.functions.ts): the consumer parses +
  // re-validates with generateFormSchema(template).
  return { formState: JSON.stringify(formState), versionUid: versionUidFrom(res) };
}

export async function reviseComposition(
  input: UpdateCompositionInput,
): Promise<UpdateCompositionResult> {
  const ctx = await requireContext();
  const template = await loadWebTemplate(ctx, input.templateId);
  const body = toFlatBody(template, input.formState);
  if (body === null) throw fail(422, "INVALID_FORM_STATE");

  try {
    const res = await callEhrbase(ctx, {
      method: "PUT",
      path: `ehr/${input.ehrId}/composition/${encodeURIComponent(input.compositionUid)}`,
      classifyPath: CLASSIFY_PATH,
      search: flatSearch(input.templateId),
      contentType: FLAT_MEDIA_TYPE,
      accept: FLAT_MEDIA_TYPE,
      // EHRbase 2.31 FLAT quirk (verified live): the composition PUT/DELETE parses
      // If-Match as a bare value and rejects the spec-mandated surrounding quotes
      // with 400 "UUID string too large" — so send the version_uid UNQUOTED.
      ifMatch: input.versionUid,
      body,
    });
    return { status: "ok", versionUid: versionUidFrom(res) };
  } catch (err) {
    // 412 → first-class conflict result (carries the current version_uid so the
    // client can re-apply onto the latest and retry). Anything else re-throws.
    const conflict = await conflictVersionUid(err);
    if (conflict) return { status: "conflict", ...conflict };
    throw err;
  }
}

export async function removeComposition(
  input: DeleteCompositionInput,
): Promise<DeleteCompositionResult> {
  const ctx = await requireContext();
  await callEhrbase(ctx, {
    method: "DELETE",
    path: `ehr/${input.ehrId}/composition/${encodeURIComponent(input.compositionUid)}`,
    classifyPath: CLASSIFY_PATH,
    // Unquoted — see reviseComposition (EHRbase 2.31 FLAT If-Match quirk).
    ifMatch: input.versionUid,
  });
  return { deleted: true };
}

// CANONICAL (structured) export — the SAME composition GET as fetchComposition
// but WITHOUT `?format=FLAT`, so EHRbase returns the canonical openEHR
// COMPOSITION (Accept: application/json). No template load / FLAT conversion: the
// canonical body is returned verbatim as a pretty-printed JSON string for
// download. version_uid still comes from the ETag.
export async function exportCompositionCanonical(
  input: ExportCompositionInput,
): Promise<ExportCompositionResult> {
  const ctx = await requireContext();
  const res = await callEhrbase(ctx, {
    method: "GET",
    path: `ehr/${input.ehrId}/composition/${encodeURIComponent(input.compositionUid)}`,
    classifyPath: CLASSIFY_PATH,
    // No `?format=FLAT` → canonical representation.
    accept: FLAT_MEDIA_TYPE,
  });
  return {
    canonical: JSON.stringify(res.json, null, 2),
    versionUid: versionUidFrom(res),
  };
}
