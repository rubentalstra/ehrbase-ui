// Server-only VERSIONED_COMPOSITION read surface against EHRbase (openEHR
// ITS-REST 1.0.3). Wraps the version-control endpoints of a composition object:
//   fetchVersionedComposition → GET ehr/{id}/versioned_composition/{uid}
//   fetchRevisionHistory      → GET …/versioned_composition/{uid}/revision_history
//   fetchVersionAtTime        → GET …/versioned_composition/{uid}/version[?version_at_time=…]
// Every call goes through callEhrbase (auth + rate-limit + 404/403 conflation +
// typed 412). Contract/types live in version.functions.ts (CLAUDE.md rules 7+8).
//
// These return the raw canonical openEHR JSON (kept opaque — the consumer renders
// it read-only). We only assert "the response is JSON" defensively; the canonical
// VERSIONED_* shapes are deeply nested and we don't reshape them here.

import { z } from "zod";

import { callEhrbase } from "@/server/bff/call-ehrbase.server";
import { getEhrbaseContext, type EhrbaseContext } from "@/server/bff/ehrbase-context.server";

import type {
  RevisionHistoryResult,
  VersionAtTimeInput,
  VersionAtTimeResult,
  VersionedCompositionResult,
  VersionedObjectInput,
} from "./version.functions";

const JSON_MEDIA_TYPE = "application/json";
// Static classification path — never carries user ids (rate-limit-class stable
// regardless of the EHR / object id in the real path). Classifies as a
// COMPOSITION read (classifyRequest maps "composition" → COMPOSITION).
const CLASSIFY_PATH = "ehr/versioned_composition";

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

// The canonical VERSIONED_* / REVISION_HISTORY / VERSION objects are arbitrary
// openEHR JSON — validate only that the body is a JSON value (a 502 if EHRbase
// returns nothing parseable) and keep it opaque for the read-only viewer.
const JsonValueSchema = z.json();

function parseJsonBody(json: unknown): z.infer<typeof JsonValueSchema> {
  const parsed = JsonValueSchema.safeParse(json);
  if (!parsed.success) throw fail(502, "BAD_VERSION_RESULT");
  return parsed.data;
}

const versionedCompositionPath = (input: VersionedObjectInput): string =>
  `ehr/${encodeURIComponent(input.ehrId)}/versioned_composition/${encodeURIComponent(input.versionedObjectUid)}`;

export async function fetchVersionedComposition(
  input: VersionedObjectInput,
): Promise<VersionedCompositionResult> {
  const ctx = await requireContext();
  const res = await callEhrbase(ctx, {
    method: "GET",
    path: versionedCompositionPath(input),
    classifyPath: CLASSIFY_PATH,
    accept: JSON_MEDIA_TYPE,
  });
  return { versionedComposition: parseJsonBody(res.json) };
}

export async function fetchRevisionHistory(
  input: VersionedObjectInput,
): Promise<RevisionHistoryResult> {
  const ctx = await requireContext();
  const res = await callEhrbase(ctx, {
    method: "GET",
    path: `${versionedCompositionPath(input)}/revision_history`,
    classifyPath: CLASSIFY_PATH,
    accept: JSON_MEDIA_TYPE,
  });
  return { revisionHistory: parseJsonBody(res.json) };
}

export async function fetchVersionAtTime(
  input: VersionAtTimeInput,
): Promise<VersionAtTimeResult> {
  const ctx = await requireContext();
  const res = await callEhrbase(ctx, {
    method: "GET",
    path: `${versionedCompositionPath(input)}/version`,
    classifyPath: CLASSIFY_PATH,
    accept: JSON_MEDIA_TYPE,
    // version_at_time is an ISO-8601 timestamp; when absent EHRbase returns the
    // latest VERSION. URL-encode it (it carries `:` and `+`).
    ...(input.versionAtTime
      ? { search: `?version_at_time=${encodeURIComponent(input.versionAtTime)}` }
      : {}),
  });
  return { version: parseJsonBody(res.json) };
}
