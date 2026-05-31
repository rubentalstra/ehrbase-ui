// createServerFn contract for the CONTRIBUTION READ surface — openEHR ITS-REST
// 1.0.3 §CONTRIBUTION. A CONTRIBUTION is the audit/lineage unit grouping the
// VERSIONs committed together (the openEHR data-lineage layer, ADR-0024). This
// module exposes READ ONLY; the WRITE path (committer + audit-change-type
// headers, dual-layer audit per Inviolable rule 11) ships with the governance
// layer and is deferred. CLIENT-IMPORTABLE BOUNDARY (CLAUDE.md rules 7+8).
//
// The CONTRIBUTION canonical body is open openEHR JSON (`unknown` leaves), so it
// crosses the wire as a JsonValue (the concrete serialisable JSON type reused
// from query.functions.ts).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { JsonValue } from "./query.functions";
import type { JsonValue } from "./query.functions";

export const GetContributionInputSchema = z.object({
  ehrId: z.uuid(),
  contributionUid: z.string().min(1),
});
export type GetContributionInput = z.infer<typeof GetContributionInputSchema>;

export const EhrIdInputSchema = z.object({ ehrId: z.uuid() });
export type EhrIdInput = z.infer<typeof EhrIdInputSchema>;

// ─── Output contracts ─────────────────────────────────────────────────────────
export interface GetContributionResult {
  /** The CONTRIBUTION canonical object (uid + audit + versions[]). */
  contribution: JsonValue;
}
export interface ListContributionsResult {
  /** The contribution uids present in the EHR (most recent first if EHRbase orders). */
  contributionUids: string[];
}

// ─── Server fns ───────────────────────────────────────────────────────────────
export const getContribution = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => GetContributionInputSchema.parse(d))
  .handler(async ({ data }): Promise<GetContributionResult> => {
    const { fetchContribution } = await import("./contribution.server");
    return fetchContribution(data);
  });

export const listContributions = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => EhrIdInputSchema.parse(d))
  .handler(async ({ data }): Promise<ListContributionsResult> => {
    const { fetchContributionList } = await import("./contribution.server");
    return fetchContributionList(data);
  });
