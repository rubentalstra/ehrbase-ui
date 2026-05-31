// Server-only CONTRIBUTION READ surface against EHRbase (openEHR ITS-REST
// 1.0.3 §CONTRIBUTION). Read only — the WRITE path (committer/audit headers +
// dual-layer audit, Inviolable rule 11) ships with the governance layer
// (deferred). Wraps:
//   fetchContribution     → GET ehr/{id}/contribution/{uid}
//   fetchContributionList → AQL (EHR CONTAINS CONTRIBUTION) — ITS-REST has no
//                           list-contributions endpoint, so we enumerate the
//                           uids with a contained-CONTRIBUTION query.
// Every call goes through callEhrbase (auth + rate-limit + 404/403 conflation).
// Contract/types live in contribution.functions.ts (CLAUDE.md rules 7+8).
//
// LIVE-EHRBASE CONFIRMATION NEEDED: the `EHR e CONTAINS CONTRIBUTION` AQL path is
// EHRbase-version-dependent (some builds expose CONTRIBUTION as an AQL container,
// others only via the direct endpoint). Verify against the live stack; if the
// container is unsupported the list returns empty and the direct get still works.

import { z } from "zod";

import { callEhrbase } from "@/server/bff/call-ehrbase.server";
import { getEhrbaseContext, type EhrbaseContext } from "@/server/bff/ehrbase-context.server";

import type {
  EhrIdInput,
  GetContributionInput,
  GetContributionResult,
  ListContributionsResult,
} from "./contribution.functions";

const JSON_MEDIA_TYPE = "application/json";
// Static classification paths — never carry user ids. The direct read maps to
// the CONTRIBUTION resource; the list uses the strict `aql` class (query/…).
const CLASSIFY_PATH = "ehr/contribution";
const LIST_CLASSIFY_PATH = "query/aql";

// AQL that enumerates the contribution uids in one EHR. $ehrId substituted by
// EHRbase. ORDER omitted — CONTRIBUTION has no portable time field across builds.
const CONTRIBUTION_LIST_AQL =
  "SELECT con/uid/value AS uid FROM EHR e[ehr_id/value=$ehrId] CONTAINS CONTRIBUTION con";

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

// The CONTRIBUTION canonical body is arbitrary openEHR JSON — keep it opaque.
const JsonValueSchema = z.json();

export async function fetchContribution(
  input: GetContributionInput,
): Promise<GetContributionResult> {
  const ctx = await requireContext();
  const res = await callEhrbase(ctx, {
    method: "GET",
    path: `ehr/${encodeURIComponent(input.ehrId)}/contribution/${encodeURIComponent(input.contributionUid)}`,
    classifyPath: CLASSIFY_PATH,
    accept: JSON_MEDIA_TYPE,
  });
  const parsed = JsonValueSchema.safeParse(res.json);
  if (!parsed.success) throw fail(502, "BAD_CONTRIBUTION");
  return { contribution: parsed.data };
}

// RESULT_SET → flat uid list. Rows are [[uid], [uid], …]; keep string cells only.
const AqlUidResultSchema = z.object({
  rows: z.array(z.array(z.json())).default([]),
});

export async function fetchContributionList(
  input: EhrIdInput,
): Promise<ListContributionsResult> {
  const ctx = await requireContext();
  const res = await callEhrbase(ctx, {
    method: "POST",
    path: "query/aql",
    classifyPath: LIST_CLASSIFY_PATH,
    contentType: JSON_MEDIA_TYPE,
    accept: JSON_MEDIA_TYPE,
    body: JSON.stringify({
      q: CONTRIBUTION_LIST_AQL,
      query_parameters: { ehrId: input.ehrId },
    }),
  });

  const parsed = AqlUidResultSchema.safeParse(res.json);
  if (!parsed.success) throw fail(502, "BAD_CONTRIBUTION_LIST");
  const uids = parsed.data.rows.flatMap((row) => {
    const cell = row[0];
    return typeof cell === "string" && cell.length > 0 ? [cell] : [];
  });
  return { contributionUids: uids };
}
