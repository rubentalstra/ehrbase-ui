// Server-only EHR lifecycle against EHRbase (Part C Phase 1 — engine-first
// workbench). Wraps the openEHR ITS-REST EHR + EHR_STATUS endpoints:
//   createEhr      → POST ehr                       (optional EHR_STATUS body)
//   fetchEhr       → GET  ehr/{id}                  (canonical EHR)
//   fetchEhrStatus → GET  ehr/{id}/ehr_status       (+ version_uid in ETag)
//   reviseEhrStatus→ PUT  ehr/{id}/ehr_status       (If-Match version_uid)
// Every call goes through callEhrbase (auth + rate-limit + 404/403 conflation +
// typed 412). Contract/types live in ehr.functions.ts (CLAUDE.md rules 7+8).

import { z } from "zod";

import { callEhrbase, type EhrbaseOk } from "@/server/bff/call-ehrbase.server";
import { getEhrbaseContext, type EhrbaseContext } from "@/server/bff/ehrbase-context.server";

import type {
  CreateEhrInput,
  CreateEhrResult,
  EhrIdInput,
  EhrSubject,
  GetEhrResult,
  GetEhrStatusResult,
  UpdateEhrStatusInput,
  UpdateEhrStatusResult,
} from "./ehr.functions";

const JSON_MEDIA_TYPE = "application/json";
// Static classification path — never carries user ids (keeps the rate-limit class
// stable regardless of the EHR id in the real path).
const CLASSIFY_PATH = "ehr";

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
// in the ETag on EHR_STATUS read/write.
function versionUidFrom(res: EhrbaseOk): string {
  if (res.etag) return res.etag.replace(/^"|"$/gu, "");
  throw fail(502, "NO_VERSION_UID");
}

const CanonicalEhrSchema = z.object({
  ehr_id: z.object({ value: z.string() }),
  system_id: z.object({ value: z.string() }).optional(),
  time_created: z.object({ value: z.string() }).optional(),
});

// POST /ehr returns the new ehr_id in the Location header
// (`{baseUrl}/ehr/{ehr_id}`); fall back to the representation body when present.
function ehrIdFrom(res: EhrbaseOk): string {
  const seg = res.location?.split("/").pop();
  if (seg) return decodeURIComponent(seg);
  const parsed = CanonicalEhrSchema.safeParse(res.json);
  if (parsed.success) return parsed.data.ehr_id.value;
  throw fail(502, "NO_EHR_ID");
}

// Minimal canonical EHR_STATUS carrying the subject as a PARTY_SELF external_ref
// into the demographic provider (CLAUDE.md rule 12 — never inline demographics).
function ehrStatusWithSubject(subject: EhrSubject): string {
  return JSON.stringify({
    _type: "EHR_STATUS",
    name: { _type: "DV_TEXT", value: "EHR Status" },
    archetype_node_id: "openEHR-EHR-EHR_STATUS.generic.v1",
    subject: {
      _type: "PARTY_SELF",
      external_ref: {
        _type: "PARTY_REF",
        namespace: subject.namespace,
        type: "PERSON",
        id: { _type: "GENERIC_ID", value: subject.id, scheme: subject.namespace },
      },
    },
    is_queryable: true,
    is_modifiable: true,
  });
}

export async function createEhrImpl(input: CreateEhrInput): Promise<CreateEhrResult> {
  const ctx = await requireContext();
  const body = input.subject ? ehrStatusWithSubject(input.subject) : undefined;
  const res = await callEhrbase(ctx, {
    method: "POST",
    path: "ehr",
    classifyPath: CLASSIFY_PATH,
    accept: JSON_MEDIA_TYPE,
    ...(body ? { contentType: JSON_MEDIA_TYPE, body } : {}),
  });
  return { ehrId: ehrIdFrom(res) };
}

export async function fetchEhr(input: EhrIdInput): Promise<GetEhrResult> {
  const ctx = await requireContext();
  const res = await callEhrbase(ctx, {
    method: "GET",
    path: `ehr/${encodeURIComponent(input.ehrId)}`,
    classifyPath: CLASSIFY_PATH,
    accept: JSON_MEDIA_TYPE,
  });
  const ehr = CanonicalEhrSchema.safeParse(res.json);
  if (!ehr.success) throw fail(502, "BAD_EHR");
  return {
    ehrId: ehr.data.ehr_id.value,
    systemId: ehr.data.system_id?.value ?? null,
    timeCreated: ehr.data.time_created?.value ?? null,
  };
}

export async function fetchEhrStatus(input: EhrIdInput): Promise<GetEhrStatusResult> {
  const ctx = await requireContext();
  const res = await callEhrbase(ctx, {
    method: "GET",
    path: `ehr/${encodeURIComponent(input.ehrId)}/ehr_status`,
    classifyPath: CLASSIFY_PATH,
    accept: JSON_MEDIA_TYPE,
  });
  // JSON-string boundary (see ehr.functions.ts): the consumer parses + renders.
  return { ehrStatus: JSON.stringify(res.json), versionUid: versionUidFrom(res) };
}

export async function reviseEhrStatus(
  input: UpdateEhrStatusInput,
): Promise<UpdateEhrStatusResult> {
  const ctx = await requireContext();
  const res = await callEhrbase(ctx, {
    method: "PUT",
    path: `ehr/${encodeURIComponent(input.ehrId)}/ehr_status`,
    classifyPath: CLASSIFY_PATH,
    contentType: JSON_MEDIA_TYPE,
    accept: JSON_MEDIA_TYPE,
    // EHRbase 2.31 wants the BARE version_uid in If-Match for EHR_STATUS too —
    // the double-quoted (RFC-7232 / ITS-REST) form returns 400 "UUID string too
    // large", same quirk as the FLAT composition endpoint. Live-confirmed
    // 2026-05-31 (scripts/dev e2e): quoted → 400, bare → 204.
    ifMatch: input.versionUid,
    body: JSON.stringify(input.ehrStatus),
  });
  return { versionUid: versionUidFrom(res) };
}
