// Orchestration tests for template.server (Phase 1 — workbench): correct EHRbase
// call shape for the ADL 1.4 template list + OPT upload, lenient list parsing
// (rows without a template_id are dropped, not fatal), and template-id extraction
// on upload (Location preferred, OPT <template_id> fallback). callEhrbase + the
// session resolve are mocked — they have their own tests.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({ headers: new Headers() }),
}));
vi.mock("@/server/bff/ehrbase-context.server", () => ({ getEhrbaseContext: vi.fn() }));
vi.mock("@/server/bff/call-ehrbase.server", () => ({ callEhrbase: vi.fn() }));

import { callEhrbase } from "@/server/bff/call-ehrbase.server";
import { getEhrbaseContext } from "@/server/bff/ehrbase-context.server";

import { fetchTemplateList, storeTemplate } from "../template.server.ts";

const JSON_CT = "application/json";
const XML_CT = "application/xml";
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

describe("fetchTemplateList", () => {
  it("GETs the ADL 1.4 list and maps snake_case rows to summaries", async () => {
    vi.mocked(callEhrbase).mockResolvedValue({
      status: 200,
      etag: null,
      location: null,
      json: [
        {
          template_id: "vitals.v1",
          concept: "Vital signs",
          created_timestamp: "2026-05-30T10:00:00Z",
        },
        { template_id: "minimal.v1" },
      ],
    });

    const res = await fetchTemplateList();

    expect(res).toEqual([
      { templateId: "vitals.v1", conceptName: "Vital signs", createdTimestamp: "2026-05-30T10:00:00Z" },
      { templateId: "minimal.v1", conceptName: null, createdTimestamp: null },
    ]);
    const opts = vi.mocked(callEhrbase).mock.calls[0]?.[1];
    expect(opts?.method).toBe("GET");
    expect(opts?.path).toBe("definition/template/adl1.4");
    expect(opts?.classifyPath).toBe("definition/template/adl1.4");
    expect(opts?.accept).toBe(JSON_CT);
  });

  it("drops rows without a template_id rather than failing the whole list", async () => {
    vi.mocked(callEhrbase).mockResolvedValue({
      status: 200,
      etag: null,
      location: null,
      json: [{ concept: "no id here" }, { template_id: "ok.v1" }],
    });

    const res = await fetchTemplateList();

    expect(res).toEqual([{ templateId: "ok.v1", conceptName: null, createdTimestamp: null }]);
  });

  it("treats a null body as an empty list", async () => {
    vi.mocked(callEhrbase).mockResolvedValue({ status: 200, etag: null, location: null, json: null });
    expect(await fetchTemplateList()).toEqual([]);
  });
});

describe("storeTemplate", () => {
  const opt = "<template><template_id><value>uploaded.v1</value></template_id></template>";

  it("POSTs the OPT XML and extracts the template_id from the Location header", async () => {
    vi.mocked(callEhrbase).mockResolvedValue({
      status: 201,
      etag: null,
      location: "http://ehrbase/x/definition/template/adl1.4/uploaded.v1",
      json: null,
    });

    const res = await storeTemplate({ opt });

    expect(res.templateId).toBe("uploaded.v1");
    const opts = vi.mocked(callEhrbase).mock.calls[0]?.[1];
    expect(opts?.method).toBe("POST");
    expect(opts?.path).toBe("definition/template/adl1.4");
    expect(opts?.classifyPath).toBe("definition/template/adl1.4");
    expect(opts?.contentType).toBe(XML_CT);
    expect(opts?.body).toBe(opt);
  });

  it("falls back to the OPT <template_id> when no Location header is present", async () => {
    vi.mocked(callEhrbase).mockResolvedValue({ status: 200, etag: null, location: null, json: null });

    const res = await storeTemplate({ opt });

    expect(res.templateId).toBe("uploaded.v1");
  });
});
