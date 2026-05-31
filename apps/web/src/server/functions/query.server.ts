// Server-only AQL execution against EHRbase (Part C Phase 1 — engine-first
// workbench). POSTs an ad-hoc AQL query to query/aql and normalises EHRbase's
// RESULT_SET into { columns, rows }. Goes through callEhrbase (auth + the strict
// `aql` rate-limit + 404/403 conflation). Contract/types in query.functions.ts.

import { z } from "zod";

import { callEhrbase } from "@/server/bff/call-ehrbase.server";
import { getEhrbaseContext, type EhrbaseContext } from "@/server/bff/ehrbase-context.server";

import type { ExecuteAqlInput, ExecuteAqlResult } from "./query.functions";

const JSON_MEDIA_TYPE = "application/json";
// Static path → classifyRequest maps `query` to the strict `aql` rate-limit class.
const CLASSIFY_PATH = "query/aql";

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

// EHRbase RESULT_SET: { meta, name, q, columns: [{ name, path }], rows: [[…]] }.
// The unknown leaf cells are real openEHR JSON; we keep them opaque for the
// caller's table/viewer to render.
const AqlResultSchema = z.object({
  columns: z
    .array(z.object({ name: z.string().optional(), path: z.string().optional() }))
    .default([]),
  rows: z.array(z.array(z.json())).default([]),
});

export async function runAql(input: ExecuteAqlInput): Promise<ExecuteAqlResult> {
  const ctx = await requireContext();
  const body = JSON.stringify({
    q: input.q,
    ...(input.queryParameters ? { query_parameters: input.queryParameters } : {}),
    ...(input.offset === undefined ? {} : { offset: input.offset }),
    ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
  });

  const res = await callEhrbase(ctx, {
    method: "POST",
    path: "query/aql",
    classifyPath: CLASSIFY_PATH,
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
