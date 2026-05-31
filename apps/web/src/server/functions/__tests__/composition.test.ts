// Orchestration tests for composition.server (Tranche 1c): correct EHRbase call
// shape (method/path/format/content-type), real FLAT conversion (formStateToFlat
// / flatToFormState run for real, not mocked — per the plan), version_uid
// extraction (ETag preferred, Location fallback), and If-Match on update/delete.
// The audited EHRbase call (callEhrbase) + the cached template load + the session
// resolve are mocked — they have their own tests.

import { WebTemplate } from "@ehrbase-ui/openehr-web-template";
import { formStateToFlat } from "@ehrbase-ui/openehr-flat";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({ headers: new Headers() }),
}));
vi.mock("@/server/bff/ehrbase-context.server", () => ({ getEhrbaseContext: vi.fn() }));
vi.mock("@/server/bff/call-ehrbase.server", () => ({ callEhrbase: vi.fn() }));
vi.mock("../template.server.ts", () => ({ loadWebTemplate: vi.fn() }));

import { callEhrbase } from "@/server/bff/call-ehrbase.server";
import { getEhrbaseContext } from "@/server/bff/ehrbase-context.server";

import {
  createComposition,
  exportCompositionCanonical,
  fetchComposition,
  removeComposition,
  reviseComposition,
} from "../composition.server.ts";
import { loadWebTemplate } from "../template.server.ts";

const template = WebTemplate.parse({
  templateId: "vitals.v1",
  defaultLanguage: "en",
  languages: ["en"],
  tree: {
    id: "vitals",
    rmType: "COMPOSITION",
    min: 1,
    max: 1,
    children: [
      {
        id: "weight",
        rmType: "DV_QUANTITY",
        min: 0,
        max: 1,
        inputs: [
          { suffix: "magnitude", type: "DECIMAL" },
          { suffix: "unit", type: "CODED_TEXT" },
        ],
      },
      { id: "note", rmType: "DV_TEXT", min: 0, max: 1, inputs: [{ type: "TEXT" }] },
    ],
  },
});

const EHR_ID = "11111111-1111-1111-1111-111111111111";
const FLAT_CT = "application/json";
const formState = { weight: { magnitude: 70.5, unit: "kg" }, note: "stable" };

const ctx = {
  user: { id: "u1", email: "e@x", name: "N", roles: [] },
  accessToken: "tok",
  baseUrl: "http://ehrbase/x",
  sid: "sess",
};

beforeEach(() => {
  vi.mocked(getEhrbaseContext).mockResolvedValue(ctx);
  vi.mocked(loadWebTemplate).mockResolvedValue(template);
  vi.mocked(callEhrbase).mockReset();
});

describe("createComposition", () => {
  it("POSTs a FLAT body and returns the version_uid from the ETag", async () => {
    vi.mocked(callEhrbase).mockResolvedValue({
      status: 201,
      etag: '"abc::local.ehrbase.org::1"',
      location: null,
      json: null,
    });

    const res = await createComposition({ ehrId: EHR_ID, templateId: "vitals.v1", formState });

    expect(res.versionUid).toBe("abc::local.ehrbase.org::1");
    const opts = vi.mocked(callEhrbase).mock.calls[0]?.[1];
    expect(opts?.method).toBe("POST");
    expect(opts?.path).toBe(`ehr/${EHR_ID}/composition`);
    // EHRbase 2.31: FLAT body as application/json + ?format=FLAT&templateId=<id>
    expect(opts?.search).toBe("?format=FLAT&templateId=vitals.v1");
    expect(opts?.contentType).toBe(FLAT_CT);
    expect(opts?.classifyPath).toBe("composition");
    const body = z.record(z.string(), z.unknown()).parse(JSON.parse(opts?.body ?? "{}"));
    expect(body["vitals/weight|magnitude"]).toBe(70.5);
    expect(body["vitals/note|value"]).toBe("stable");
  });

  it("falls back to the Location segment when no ETag is present", async () => {
    vi.mocked(callEhrbase).mockResolvedValue({
      status: 201,
      etag: null,
      location: "http://ehrbase/x/ehr/e/composition/loc-uid::sys::1",
      json: null,
    });
    const res = await createComposition({ ehrId: EHR_ID, templateId: "vitals.v1", formState });
    expect(res.versionUid).toBe("loc-uid::sys::1");
  });
});

describe("fetchComposition", () => {
  it("reads FLAT and round-trips it back to form-state (as a JSON string)", async () => {
    const flat = formStateToFlat(template, formState);
    vi.mocked(callEhrbase).mockResolvedValue({
      status: 200,
      etag: '"v2::sys::2"',
      location: null,
      json: flat,
    });

    const res = await fetchComposition({
      ehrId: EHR_ID,
      templateId: "vitals.v1",
      compositionUid: "v2",
    });

    expect(res.versionUid).toBe("v2::sys::2");
    expect(JSON.parse(res.formState)).toEqual(formState);
    expect(vi.mocked(callEhrbase).mock.calls[0]?.[1].method).toBe("GET");
  });
});

describe("reviseComposition", () => {
  it("PUTs with a bare (unquoted) If-Match version_uid and returns an ok result", async () => {
    vi.mocked(callEhrbase).mockResolvedValue({
      status: 200,
      etag: '"obj::sys::3"',
      location: null,
      json: null,
    });

    const res = await reviseComposition({
      ehrId: EHR_ID,
      templateId: "vitals.v1",
      compositionUid: "obj",
      versionUid: "obj::sys::2",
      formState,
    });

    expect(res).toEqual({ status: "ok", versionUid: "obj::sys::3" });
    const opts = vi.mocked(callEhrbase).mock.calls[0]?.[1];
    expect(opts?.method).toBe("PUT");
    expect(opts?.path).toBe(`ehr/${EHR_ID}/composition/obj`);
    // EHRbase 2.31 FLAT quirk: If-Match is the bare version_uid (no quotes).
    expect(opts?.ifMatch).toBe("obj::sys::2");
  });

  it("returns a CONFLICT result (current version_uid de-quoted) on a typed 412", async () => {
    // The 412 callEhrbase throws: a Response carrying { code, etag }.
    vi.mocked(callEhrbase).mockRejectedValue(
      new Response(JSON.stringify({ code: "CONFLICT", etag: '"obj::sys::5"' }), {
        status: 412,
        headers: { "content-type": "application/json" },
      }),
    );

    const res = await reviseComposition({
      ehrId: EHR_ID,
      templateId: "vitals.v1",
      compositionUid: "obj",
      versionUid: "obj::sys::2",
      formState,
    });

    expect(res).toEqual({ status: "conflict", currentVersionUid: "obj::sys::5" });
  });

  it("re-throws non-412 errors untouched", async () => {
    const notFound = new Response(JSON.stringify({ code: "NOT_FOUND" }), { status: 404 });
    vi.mocked(callEhrbase).mockRejectedValue(notFound);

    await expect(
      reviseComposition({
        ehrId: EHR_ID,
        templateId: "vitals.v1",
        compositionUid: "obj",
        versionUid: "obj::sys::2",
        formState,
      }),
    ).rejects.toBe(notFound);
  });
});

describe("exportCompositionCanonical", () => {
  it("GETs the composition WITHOUT format=FLAT and returns pretty canonical JSON", async () => {
    const canonical = { _type: "COMPOSITION", name: { value: "Vitals" } };
    vi.mocked(callEhrbase).mockResolvedValue({
      status: 200,
      etag: '"obj::sys::3"',
      location: null,
      json: canonical,
    });

    const res = await exportCompositionCanonical({ ehrId: EHR_ID, compositionUid: "obj" });

    expect(res.versionUid).toBe("obj::sys::3");
    expect(JSON.parse(res.canonical)).toEqual(canonical);
    const opts = vi.mocked(callEhrbase).mock.calls[0]?.[1];
    expect(opts?.method).toBe("GET");
    expect(opts?.path).toBe(`ehr/${EHR_ID}/composition/obj`);
    // Canonical export → NO ?format=FLAT.
    expect(opts?.search).toBeUndefined();
  });
});

describe("removeComposition", () => {
  it("DELETEs with If-Match and reports deleted", async () => {
    vi.mocked(callEhrbase).mockResolvedValue({ status: 204, etag: null, location: null, json: null });

    const res = await removeComposition({
      ehrId: EHR_ID,
      compositionUid: "obj",
      versionUid: "obj::sys::3",
    });

    expect(res.deleted).toBe(true);
    const opts = vi.mocked(callEhrbase).mock.calls[0]?.[1];
    expect(opts?.method).toBe("DELETE");
    expect(opts?.ifMatch).toBe("obj::sys::3");
  });
});
