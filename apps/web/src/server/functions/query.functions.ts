// createServerFn contract for AQL execution (Part C Phase 1 — engine-first
// workbench). Wraps the openEHR ITS-REST ad-hoc Query endpoint (POST query/aql).
// Every clinical read surface (vitals, labs, problems, meds, orders) ultimately
// runs an AQL query through here. CLIENT-IMPORTABLE BOUNDARY (CLAUDE.md rules 7+8).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const ExecuteAqlInputSchema = z.object({
  q: z.string().min(1),
  // $name → value bindings substituted into the query by EHRbase.
  queryParameters: z.record(z.string(), z.json()).optional(),
  offset: z.number().int().min(0).optional(),
  // Page size; EHRbase caps this server-side. Bounded here as a sanity guard.
  fetch: z.number().int().min(1).max(1000).optional(),
});
export type ExecuteAqlInput = z.infer<typeof ExecuteAqlInputSchema>;

// A concrete (recursive) JSON value type — unlike `unknown`, it satisfies
// createServerFn's serializable-return constraint while still modelling the
// arbitrary openEHR JSON in a result cell.
export type JsonValue = z.infer<ReturnType<typeof z.json>>;

export interface AqlColumn {
  name: string | null;
  path: string | null;
}
export interface ExecuteAqlResult {
  columns: AqlColumn[];
  /** Result rows; each cell is arbitrary openEHR JSON (scalar or nested object). */
  rows: JsonValue[][];
}

export const executeAql = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ExecuteAqlInputSchema.parse(d))
  .handler(async ({ data }): Promise<ExecuteAqlResult> => {
    const { runAql } = await import("./query.server");
    return runAql(data);
  });
