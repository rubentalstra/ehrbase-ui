// createServerFn contract for STORED QUERIES — openEHR ITS-REST 1.0.3
// §DEFINITION (query) + §QUERY (stored). Lets the workbench register a named AQL
// query in EHRbase and execute it by name. CLIENT-IMPORTABLE BOUNDARY: owns the
// input schemas + output types; the .server.ts beside it makes the EHRbase call
// (CLAUDE.md rules 7+8).
//
// The run result reuses ExecuteAqlResult / JsonValue from query.functions.ts —
// a stored query returns the same RESULT_SET shape as an ad-hoc query.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { ExecuteAqlResult } from "./query.functions";

// A qualified stored-query name (reverse-domain, e.g. `org.example::vitals`).
// Loosely validated client-side — EHRbase owns the real naming rules.
const QueryNameSchema = z.string().min(1);

export const ListStoredQueriesInputSchema = z.object({
  // Optional name prefix filter (EHRbase `qualified_query_name` qualifier).
  qualifiedQueryName: z.string().min(1).optional(),
});
export type ListStoredQueriesInput = z.infer<typeof ListStoredQueriesInputSchema>;

export const GetStoredQueryInputSchema = z.object({
  name: QueryNameSchema,
  // Optional SemVer; when omitted EHRbase returns the latest version.
  version: z.string().min(1).optional(),
});
export type GetStoredQueryInput = z.infer<typeof GetStoredQueryInputSchema>;

export const PutStoredQueryInputSchema = z.object({
  name: QueryNameSchema,
  // The AQL text to register under `name`.
  aql: z.string().min(1),
  // Optional explicit version; EHRbase auto-bumps when omitted.
  version: z.string().min(1).optional(),
});
export type PutStoredQueryInput = z.infer<typeof PutStoredQueryInputSchema>;

export const RunStoredQueryInputSchema = z.object({
  name: QueryNameSchema,
  version: z.string().min(1).optional(),
  // $name → value bindings substituted by EHRbase (same as ad-hoc query params).
  queryParameters: z.record(z.string(), z.json()).optional(),
  offset: z.number().int().min(0).optional(),
  fetch: z.number().int().min(1).max(1000).optional(),
});
export type RunStoredQueryInput = z.infer<typeof RunStoredQueryInputSchema>;

// ─── Output contracts ─────────────────────────────────────────────────────────
export interface StoredQuerySummary {
  name: string;
  type: string | null;
  version: string | null;
  timeCreated: string | null;
}
export interface StoredQueryDefinition {
  name: string;
  version: string | null;
  type: string | null;
  /** The AQL text registered under this name. */
  query: string;
}
export interface PutStoredQueryResult {
  name: string;
  version: string | null;
}

// ─── Server fns ───────────────────────────────────────────────────────────────
export const listStoredQueries = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => ListStoredQueriesInputSchema.parse(d))
  .handler(async ({ data }): Promise<StoredQuerySummary[]> => {
    const { fetchStoredQueryList } = await import("./stored-query.server");
    return fetchStoredQueryList(data);
  });

export const getStoredQuery = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => GetStoredQueryInputSchema.parse(d))
  .handler(async ({ data }): Promise<StoredQueryDefinition> => {
    const { fetchStoredQuery } = await import("./stored-query.server");
    return fetchStoredQuery(data);
  });

export const putStoredQuery = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => PutStoredQueryInputSchema.parse(d))
  .handler(async ({ data }): Promise<PutStoredQueryResult> => {
    const { storeStoredQuery } = await import("./stored-query.server");
    return storeStoredQuery(data);
  });

export const runStoredQuery = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => RunStoredQueryInputSchema.parse(d))
  .handler(async ({ data }): Promise<ExecuteAqlResult> => {
    const { executeStoredQuery } = await import("./stored-query.server");
    return executeStoredQuery(data);
  });
