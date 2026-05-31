// Orchestration tests for stored-query.server (F4): correct EHRbase call shape
// for the DEFINITION query endpoints (list / get / put) and the stored-query RUN
// endpoint (POST query/{name}). Asserts method/path/classify, the AQL text body
// on PUT, the version segment, and RESULT_SET normalisation. callEhrbase + the
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

import {
  executeStoredQuery,
  fetchStoredQuery,
  fetchStoredQueryList,
  storeStoredQuery,
} from "../stored-query.server.ts";

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

describe("fetchStoredQueryList", () => {
  it("GETs definition/query and maps the versions array", async () => {
    vi.mocked(callEhrbase).mockResolvedValue({
      status: 200,
      etag: null,
      location: null,
      json: {
        versions: [
          { name: "org.example::vitals", type: "AQL", version: "1.0.0", saved: "2026-05-30T10:00:00Z" },
          { type: "AQL" }, // no name → dropped
        ],
      },
    });

    const res = await fetchStoredQueryList({});

    expect(res).toEqual([
      { name: "org.example::vitals", type: "AQL", version: "1.0.0", timeCreated: "2026-05-30T10:00:00Z" },
    ]);
    const opts = vi.mocked(callEhrbase).mock.calls[0]?.[1];
    expect(opts?.method).toBe("GET");
    expect(opts?.path).toBe("definition/query");
    expect(opts?.classifyPath).toBe("definition/query");
  });

  it("appends the qualified_query_name segment when given", async () => {
    vi.mocked(callEhrbase).mockResolvedValue({ status: 200, etag: null, location: null, json: { versions: [] } });
    await fetchStoredQueryList({ qualifiedQueryName: "org.example::vitals" });
    expect(vi.mocked(callEhrbase).mock.calls[0]?.[1].path).toBe(
      "definition/query/org.example%3A%3Avitals",
    );
  });
});

describe("fetchStoredQuery", () => {
  it("GETs definition/query/{name}/{version} and returns the AQL text", async () => {
    vi.mocked(callEhrbase).mockResolvedValue({
      status: 200,
      etag: null,
      location: null,
      json: { name: "org.example::vitals", version: "1.0.0", type: "AQL", q: "SELECT e FROM EHR e" },
    });

    const res = await fetchStoredQuery({ name: "org.example::vitals", version: "1.0.0" });

    expect(res).toEqual({
      name: "org.example::vitals",
      version: "1.0.0",
      type: "AQL",
      query: "SELECT e FROM EHR e",
    });
    expect(vi.mocked(callEhrbase).mock.calls[0]?.[1].path).toBe(
      "definition/query/org.example%3A%3Avitals/1.0.0",
    );
  });
});

describe("storeStoredQuery", () => {
  it("PUTs definition/query/{name} with ?type=AQL and the AQL text body", async () => {
    vi.mocked(callEhrbase).mockResolvedValue({
      status: 200,
      etag: null,
      location: null,
      json: { name: "org.example::vitals", version: "2.0.0", q: "SELECT e FROM EHR e" },
    });

    const res = await storeStoredQuery({ name: "org.example::vitals", aql: "SELECT e FROM EHR e" });

    expect(res).toEqual({ name: "org.example::vitals", version: "2.0.0" });
    const opts = vi.mocked(callEhrbase).mock.calls[0]?.[1];
    expect(opts?.method).toBe("PUT");
    expect(opts?.path).toBe("definition/query/org.example%3A%3Avitals");
    expect(opts?.search).toBe("?type=AQL");
    expect(opts?.contentType).toBe("text/plain");
    expect(opts?.body).toBe("SELECT e FROM EHR e");
  });
});

describe("executeStoredQuery", () => {
  it("POSTs query/{name}, sends params in the body, and normalises the RESULT_SET", async () => {
    vi.mocked(callEhrbase).mockResolvedValue({
      status: 200,
      etag: null,
      location: null,
      json: {
        columns: [{ name: "uid", path: "/uid/value" }],
        rows: [["c-1"], ["c-2"]],
      },
    });

    const res = await executeStoredQuery({
      name: "org.example::vitals",
      version: "1.0.0",
      queryParameters: { ehrId: "abc" },
      fetch: 10,
    });

    expect(res.columns).toEqual([{ name: "uid", path: "/uid/value" }]);
    expect(res.rows).toEqual([["c-1"], ["c-2"]]);
    const opts = vi.mocked(callEhrbase).mock.calls[0]?.[1];
    expect(opts?.method).toBe("POST");
    expect(opts?.path).toBe("query/org.example%3A%3Avitals/1.0.0");
    expect(opts?.classifyPath).toBe("query/stored");
    const body = z
      .object({
        query_parameters: z.record(z.string(), z.unknown()),
        fetch: z.number().optional(),
      })
      .parse(JSON.parse(opts?.body ?? "{}"));
    expect(body.query_parameters).toEqual({ ehrId: "abc" });
    expect(body.fetch).toBe(10);
  });
});
