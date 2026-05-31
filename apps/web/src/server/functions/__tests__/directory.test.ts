// Orchestration tests for directory.server (F4): correct EHRbase call shape for
// the DIRECTORY/FOLDER endpoints — GET (with optional path/version_at_time), POST
// (create), PUT (update with a DOUBLE-QUOTED If-Match version_uid, canonical
// endpoint). callEhrbase + the session resolve are mocked.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({ headers: new Headers() }),
}));
vi.mock("@/server/bff/ehrbase-context.server", () => ({ getEhrbaseContext: vi.fn() }));
vi.mock("@/server/bff/call-ehrbase.server", () => ({ callEhrbase: vi.fn() }));

import { callEhrbase } from "@/server/bff/call-ehrbase.server";
import { getEhrbaseContext } from "@/server/bff/ehrbase-context.server";

import { addDirectory, fetchDirectory, reviseDirectory } from "../directory.server.ts";

const EHR_ID = "11111111-1111-1111-1111-111111111111";
const JSON_CT = "application/json";
const folder = { _type: "FOLDER", name: { _type: "DV_TEXT", value: "root" } };
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

describe("fetchDirectory", () => {
  it("GETs ehr/{id}/directory and returns folder + version_uid from the ETag", async () => {
    vi.mocked(callEhrbase).mockResolvedValue({
      status: 200,
      etag: '"dir::sys::1"',
      location: null,
      json: folder,
    });

    const res = await fetchDirectory({ ehrId: EHR_ID });

    expect(res.folder).toEqual(folder);
    expect(res.versionUid).toBe("dir::sys::1");
    const opts = vi.mocked(callEhrbase).mock.calls[0]?.[1];
    expect(opts?.method).toBe("GET");
    expect(opts?.path).toBe(`ehr/${EHR_ID}/directory`);
    expect(opts?.classifyPath).toBe("ehr/directory");
    expect(opts?.search).toBeUndefined();
  });

  it("encodes path + version_at_time into the search string", async () => {
    vi.mocked(callEhrbase).mockResolvedValue({ status: 200, etag: null, location: null, json: folder });

    const res = await fetchDirectory({
      ehrId: EHR_ID,
      path: "episodes/2026",
      versionAtTime: "2026-05-30T10:00:00Z",
    });

    expect(res.versionUid).toBeNull();
    const search = vi.mocked(callEhrbase).mock.calls[0]?.[1].search ?? "";
    const params = new URLSearchParams(search.replace(/^\?/u, ""));
    expect(params.get("path")).toBe("episodes/2026");
    expect(params.get("version_at_time")).toBe("2026-05-30T10:00:00Z");
  });
});

describe("addDirectory", () => {
  it("POSTs the FOLDER body and returns the new version_uid", async () => {
    vi.mocked(callEhrbase).mockResolvedValue({
      status: 201,
      etag: '"dir::sys::1"',
      location: null,
      json: null,
    });

    const res = await addDirectory({ ehrId: EHR_ID, folder });

    expect(res.versionUid).toBe("dir::sys::1");
    const opts = vi.mocked(callEhrbase).mock.calls[0]?.[1];
    expect(opts?.method).toBe("POST");
    expect(opts?.path).toBe(`ehr/${EHR_ID}/directory`);
    expect(opts?.contentType).toBe(JSON_CT);
    expect(JSON.parse(opts?.body ?? "{}")).toEqual(folder);
  });
});

describe("reviseDirectory", () => {
  it("PUTs with a BARE If-Match version_uid (EHRbase 2.31 quirk — quoted 400s)", async () => {
    vi.mocked(callEhrbase).mockResolvedValue({
      status: 200,
      etag: '"dir::sys::2"',
      location: null,
      json: null,
    });

    const res = await reviseDirectory({ ehrId: EHR_ID, versionUid: "dir::sys::1", folder });

    expect(res.versionUid).toBe("dir::sys::2");
    const opts = vi.mocked(callEhrbase).mock.calls[0]?.[1];
    expect(opts?.method).toBe("PUT");
    expect(opts?.path).toBe(`ehr/${EHR_ID}/directory`);
    expect(opts?.ifMatch).toBe("dir::sys::1");
  });
});
