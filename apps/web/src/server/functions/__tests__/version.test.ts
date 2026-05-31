// Orchestration tests for version.server (F4): correct EHRbase call shape
// (method/path/classify) for the VERSIONED_COMPOSITION read surface, the
// version_at_time query param, and that the opaque canonical body is passed
// through. callEhrbase + the session resolve are mocked.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({ headers: new Headers() }),
}));
vi.mock("@/server/bff/ehrbase-context.server", () => ({ getEhrbaseContext: vi.fn() }));
vi.mock("@/server/bff/call-ehrbase.server", () => ({ callEhrbase: vi.fn() }));

import { callEhrbase } from "@/server/bff/call-ehrbase.server";
import { getEhrbaseContext } from "@/server/bff/ehrbase-context.server";

import {
  fetchRevisionHistory,
  fetchVersionAtTime,
  fetchVersionedComposition,
} from "../version.server.ts";

const EHR_ID = "11111111-1111-1111-1111-111111111111";
const OBJ = "obj-uid";
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

describe("fetchVersionedComposition", () => {
  it("GETs versioned_composition/{uid} and passes the canonical body through", async () => {
    const body = { _type: "VERSIONED_COMPOSITION", uid: { value: OBJ } };
    vi.mocked(callEhrbase).mockResolvedValue({ status: 200, etag: null, location: null, json: body });

    const res = await fetchVersionedComposition({ ehrId: EHR_ID, versionedObjectUid: OBJ });

    expect(res.versionedComposition).toEqual(body);
    const opts = vi.mocked(callEhrbase).mock.calls[0]?.[1];
    expect(opts?.method).toBe("GET");
    expect(opts?.path).toBe(`ehr/${EHR_ID}/versioned_composition/${OBJ}`);
    expect(opts?.classifyPath).toBe("ehr/versioned_composition");
  });
});

describe("fetchRevisionHistory", () => {
  it("GETs the .../revision_history sub-resource", async () => {
    vi.mocked(callEhrbase).mockResolvedValue({ status: 200, etag: null, location: null, json: [] });

    const res = await fetchRevisionHistory({ ehrId: EHR_ID, versionedObjectUid: OBJ });

    expect(res.revisionHistory).toEqual([]);
    const opts = vi.mocked(callEhrbase).mock.calls[0]?.[1];
    expect(opts?.method).toBe("GET");
    expect(opts?.path).toBe(`ehr/${EHR_ID}/versioned_composition/${OBJ}/revision_history`);
  });
});

describe("fetchVersionAtTime", () => {
  it("GETs .../version with NO query param when versionAtTime is omitted", async () => {
    vi.mocked(callEhrbase).mockResolvedValue({ status: 200, etag: null, location: null, json: {} });

    await fetchVersionAtTime({ ehrId: EHR_ID, versionedObjectUid: OBJ });

    const opts = vi.mocked(callEhrbase).mock.calls[0]?.[1];
    expect(opts?.path).toBe(`ehr/${EHR_ID}/versioned_composition/${OBJ}/version`);
    expect(opts?.search).toBeUndefined();
  });

  it("URL-encodes version_at_time into the search string when provided", async () => {
    vi.mocked(callEhrbase).mockResolvedValue({ status: 200, etag: null, location: null, json: {} });

    await fetchVersionAtTime({
      ehrId: EHR_ID,
      versionedObjectUid: OBJ,
      versionAtTime: "2026-05-30T10:00:00+02:00",
    });

    const opts = vi.mocked(callEhrbase).mock.calls[0]?.[1];
    expect(opts?.search).toBe(
      `?version_at_time=${encodeURIComponent("2026-05-30T10:00:00+02:00")}`,
    );
  });
});
