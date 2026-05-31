// Orchestration tests for contribution.server (F4, READ-ONLY): the direct
// CONTRIBUTION get (GET ehr/{id}/contribution/{uid}) and the list-via-AQL path
// (POST query/aql, CONTAINS CONTRIBUTION → flat uid list). callEhrbase + the
// session resolve are mocked.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({ headers: new Headers() }),
}));
vi.mock("@/server/bff/ehrbase-context.server", () => ({ getEhrbaseContext: vi.fn() }));
vi.mock("@/server/bff/call-ehrbase.server", () => ({ callEhrbase: vi.fn() }));

import { callEhrbase } from "@/server/bff/call-ehrbase.server";
import { getEhrbaseContext } from "@/server/bff/ehrbase-context.server";

import { fetchContribution, fetchContributionList } from "../contribution.server.ts";

const EHR_ID = "11111111-1111-1111-1111-111111111111";
const ctx = {
  user: { id: "u1", email: "e@x", name: "N", roles: [] },
  accessToken: "tok",
  baseUrl: "http://ehrbase/x",
  sid: "sess",
};

beforeEach(() => {
  vi.mocked(getEhrbaseContext).mockResolvedValue(ctx);
  vi.mocked(callEhrbase).mockReset();
});

describe("fetchContribution", () => {
  it("GETs ehr/{id}/contribution/{uid} and passes the canonical body through", async () => {
    const body = { _type: "CONTRIBUTION", uid: { value: "con-1" }, versions: [] };
    vi.mocked(callEhrbase).mockResolvedValue({ status: 200, etag: null, location: null, json: body });

    const res = await fetchContribution({ ehrId: EHR_ID, contributionUid: "con-1" });

    expect(res.contribution).toEqual(body);
    const opts = vi.mocked(callEhrbase).mock.calls[0]?.[1];
    expect(opts?.method).toBe("GET");
    expect(opts?.path).toBe(`ehr/${EHR_ID}/contribution/con-1`);
    expect(opts?.classifyPath).toBe("ehr/contribution");
  });
});

describe("fetchContributionList", () => {
  it("POSTs query/aql (CONTAINS CONTRIBUTION) and flattens the uid rows", async () => {
    vi.mocked(callEhrbase).mockResolvedValue({
      status: 200,
      etag: null,
      location: null,
      json: { rows: [["con-1"], ["con-2"], [null]] },
    });

    const res = await fetchContributionList({ ehrId: EHR_ID });

    expect(res.contributionUids).toEqual(["con-1", "con-2"]);
    const opts = vi.mocked(callEhrbase).mock.calls[0]?.[1];
    expect(opts?.method).toBe("POST");
    expect(opts?.path).toBe("query/aql");
    expect(opts?.classifyPath).toBe("query/aql");
    const sent = z
      .object({ q: z.string(), query_parameters: z.record(z.string(), z.unknown()) })
      .parse(JSON.parse(opts?.body ?? "{}"));
    expect(sent.q).toContain("CONTAINS CONTRIBUTION");
    expect(sent.query_parameters).toEqual({ ehrId: EHR_ID });
  });
});
