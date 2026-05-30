// Orchestration tests for query.server (Phase 1): correct AQL call shape (POST
// query/aql, request-body field mapping, the strict `aql` classify path) and
// RESULT_SET normalisation to { columns, rows }. callEhrbase + the session
// resolve are mocked.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({ headers: new Headers() }),
}));
vi.mock("@/server/bff/ehrbase-context.server", () => ({ getEhrbaseContext: vi.fn() }));
vi.mock("@/server/bff/call-ehrbase.server", () => ({ callEhrbase: vi.fn() }));

import { callEhrbase } from "@/server/bff/call-ehrbase.server";
import { getEhrbaseContext } from "@/server/bff/ehrbase-context.server";

import { runAql } from "../query.server.ts";

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

describe("runAql", () => {
  it("POSTs to query/aql, maps the request body, and normalises the RESULT_SET", async () => {
    vi.mocked(callEhrbase).mockResolvedValue({
      status: 200,
      etag: null,
      location: null,
      json: {
        meta: { _type: "RESULTSET" },
        name: "adhoc",
        q: "SELECT e/ehr_id/value FROM EHR e",
        columns: [{ name: "#0", path: "/ehr_id/value" }],
        rows: [["e-1"], ["e-2"]],
      },
    });

    const res = await runAql({ q: "SELECT e/ehr_id/value FROM EHR e", fetch: 10 });

    expect(res.columns).toEqual([{ name: "#0", path: "/ehr_id/value" }]);
    expect(res.rows).toEqual([["e-1"], ["e-2"]]);

    const opts = vi.mocked(callEhrbase).mock.calls[0]?.[1];
    expect(opts?.method).toBe("POST");
    expect(opts?.path).toBe("query/aql");
    expect(opts?.classifyPath).toBe("query/aql");
    const body = z
      .object({ q: z.string(), fetch: z.number().optional(), query_parameters: z.unknown().optional() })
      .parse(JSON.parse(opts?.body ?? "{}"));
    expect(body.q).toBe("SELECT e/ehr_id/value FROM EHR e");
    expect(body.fetch).toBe(10);
    expect(body.query_parameters).toBeUndefined();
  });

  it("forwards query_parameters when provided", async () => {
    vi.mocked(callEhrbase).mockResolvedValue({
      status: 200,
      etag: null,
      location: null,
      json: { columns: [], rows: [] },
    });

    await runAql({
      q: "SELECT c FROM EHR e CONTAINS COMPOSITION c WHERE e/ehr_id/value = $ehrId",
      queryParameters: { ehrId: "abc" },
    });

    const body = z
      .object({ query_parameters: z.record(z.string(), z.unknown()) })
      .parse(JSON.parse(vi.mocked(callEhrbase).mock.calls[0]?.[1].body ?? "{}"));
    expect(body.query_parameters).toEqual({ ehrId: "abc" });
  });
});
