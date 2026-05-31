// Server-only STORED QUERIES against EHRbase (openEHR ITS-REST 1.0.3):
//   fetchStoredQueryList → GET  definition/query[/{qualified_query_name}]
//   fetchStoredQuery     → GET  definition/query/{name}[/{version}]
//   storeStoredQuery     → PUT  definition/query/{name}[/{version}]?type=AQL (body = AQL text)
//   executeStoredQuery   → POST query/{name}[/{version}]   (request body = params)
// Every call goes through callEhrbase (auth + rate-limit + 404/403 conflation).
// The stored-query DEFINITION endpoints classify as TEMPLATE (definition); the
// run endpoint classifies as the strict `aql` class (query/…). Contract/types
// live in stored-query.functions.ts (CLAUDE.md rules 7+8).

import { z } from "zod";

import { callEhrbase } from "@/server/bff/call-ehrbase.server";
import { getEhrbaseContext, type EhrbaseContext } from "@/server/bff/ehrbase-context.server";

import type { ExecuteAqlResult } from "./query.functions";
import type {
  GetStoredQueryInput,
  ListStoredQueriesInput,
  PutStoredQueryInput,
  PutStoredQueryResult,
  RunStoredQueryInput,
  StoredQueryDefinition,
  StoredQuerySummary,
} from "./stored-query.functions";

const JSON_MEDIA_TYPE = "application/json";
// EHRbase stores the AQL body as plain text under the DEFINITION endpoint.
const AQL_MEDIA_TYPE = "text/plain";
// Static classification paths — never carry the user-supplied query name, so a
// crafted name can't skew the rate-limit class. The DEFINITION endpoints map to
// the TEMPLATE class; the run endpoint maps to the strict `aql` class.
const DEFINITION_CLASSIFY_PATH = "definition/query";
const RUN_CLASSIFY_PATH = "query/stored";

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

// ── List ──────────────────────────────────────────────────────────────────────
// EHRbase wraps the list in { versions: [{ name, type, version, saved, q }] }.
// Lenient: keep only entries with a name; tolerate either `saved` or
// `time_created` for the timestamp across EHRbase versions.
const StoredQueryListEntrySchema = z.looseObject({
  name: z.string().min(1),
  type: z.string().optional(),
  version: z.string().optional(),
  saved: z.string().optional(),
  time_created: z.string().optional(),
});
const StoredQueryListSchema = z.looseObject({
  versions: z.array(z.unknown()).default([]),
});

export async function fetchStoredQueryList(
  input: ListStoredQueriesInput,
): Promise<StoredQuerySummary[]> {
  const ctx = await requireContext();
  const suffix = input.qualifiedQueryName
    ? `/${encodeURIComponent(input.qualifiedQueryName)}`
    : "";
  const res = await callEhrbase(ctx, {
    method: "GET",
    path: `definition/query${suffix}`,
    classifyPath: DEFINITION_CLASSIFY_PATH,
    accept: JSON_MEDIA_TYPE,
  });

  const parsed = StoredQueryListSchema.safeParse(res.json ?? {});
  if (!parsed.success) throw fail(502, "BAD_STORED_QUERY_LIST");
  return parsed.data.versions.flatMap((row) => {
    const entry = StoredQueryListEntrySchema.safeParse(row);
    if (!entry.success) return [];
    return [
      {
        name: entry.data.name,
        type: entry.data.type ?? null,
        version: entry.data.version ?? null,
        timeCreated: entry.data.saved ?? entry.data.time_created ?? null,
      },
    ];
  });
}

// ── Get one ─────────────────────────────────────────────────────────────────
// EHRbase returns { name, version, type, q } (q = the AQL text).
const StoredQueryGetSchema = z.looseObject({
  name: z.string().min(1),
  version: z.string().optional(),
  type: z.string().optional(),
  q: z.string().default(""),
});

export async function fetchStoredQuery(
  input: GetStoredQueryInput,
): Promise<StoredQueryDefinition> {
  const ctx = await requireContext();
  const versionSeg = input.version ? `/${encodeURIComponent(input.version)}` : "";
  const res = await callEhrbase(ctx, {
    method: "GET",
    path: `definition/query/${encodeURIComponent(input.name)}${versionSeg}`,
    classifyPath: DEFINITION_CLASSIFY_PATH,
    accept: JSON_MEDIA_TYPE,
  });

  const parsed = StoredQueryGetSchema.safeParse(res.json);
  if (!parsed.success) throw fail(502, "BAD_STORED_QUERY");
  return {
    name: parsed.data.name,
    version: parsed.data.version ?? null,
    type: parsed.data.type ?? null,
    query: parsed.data.q,
  };
}

// ── Put (register/update) ─────────────────────────────────────────────────────
export async function storeStoredQuery(
  input: PutStoredQueryInput,
): Promise<PutStoredQueryResult> {
  const ctx = await requireContext();
  const versionSeg = input.version ? `/${encodeURIComponent(input.version)}` : "";
  const res = await callEhrbase(ctx, {
    method: "PUT",
    path: `definition/query/${encodeURIComponent(input.name)}${versionSeg}`,
    classifyPath: DEFINITION_CLASSIFY_PATH,
    // EHRbase wants the query type as a query param and the AQL as a text body.
    search: "?type=AQL",
    contentType: AQL_MEDIA_TYPE,
    accept: JSON_MEDIA_TYPE,
    body: input.aql,
  });
  // PUT returns the stored-query metadata in the body (or nothing on 204) — read
  // back the version when present, else echo the requested name/version.
  const parsed = StoredQueryGetSchema.safeParse(res.json);
  return {
    name: parsed.success ? parsed.data.name : input.name,
    version: parsed.success ? (parsed.data.version ?? null) : (input.version ?? null),
  };
}

// ── Run ────────────────────────────────────────────────────────────────────────
// RESULT_SET normalisation — identical shape to the ad-hoc query path
// (query.server). POST query/{name} with the params in the request body.
const AqlResultSchema = z.object({
  columns: z
    .array(z.object({ name: z.string().optional(), path: z.string().optional() }))
    .default([]),
  rows: z.array(z.array(z.json())).default([]),
});

export async function executeStoredQuery(
  input: RunStoredQueryInput,
): Promise<ExecuteAqlResult> {
  const ctx = await requireContext();
  const versionSeg = input.version ? `/${encodeURIComponent(input.version)}` : "";
  const body = JSON.stringify({
    ...(input.queryParameters ? { query_parameters: input.queryParameters } : {}),
    ...(input.offset === undefined ? {} : { offset: input.offset }),
    ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
  });

  const res = await callEhrbase(ctx, {
    method: "POST",
    path: `query/${encodeURIComponent(input.name)}${versionSeg}`,
    classifyPath: RUN_CLASSIFY_PATH,
    contentType: JSON_MEDIA_TYPE,
    accept: JSON_MEDIA_TYPE,
    body,
  });

  const parsed = AqlResultSchema.safeParse(res.json);
  if (!parsed.success) throw fail(502, "BAD_QUERY_RESULT");
  return {
    columns: parsed.data.columns.map((c) => ({ name: c.name ?? null, path: c.path ?? null })),
    rows: parsed.data.rows,
  };
}
