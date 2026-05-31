// Orchestration tests for ehr.server (Phase 1): correct EHRbase call shape
// (method/path/classify), ehr_id extraction (Location preferred), EHR_STATUS
// version_uid from the ETag, the rule-12 subject body on create, and the
// double-quoted If-Match on the canonical EHR_STATUS update. The EHRbase call
// (callEhrbase) + the session resolve are mocked — they have their own tests.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({ headers: new Headers() }),
}));
vi.mock("@/server/bff/ehrbase-context.server", () => ({ getEhrbaseContext: vi.fn() }));
vi.mock("@/server/bff/call-ehrbase.server", () => ({ callEhrbase: vi.fn() }));

import { callEhrbase } from "@/server/bff/call-ehrbase.server";
import { getEhrbaseContext } from "@/server/bff/ehrbase-context.server";

import { createEhrImpl, fetchEhr, fetchEhrStatus, reviseEhrStatus } from "../ehr.server.ts";

const EHR_ID = "11111111-1111-1111-1111-111111111111";
const JSON_CT = "application/json";
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

describe("createEhrImpl", () => {
  it("POSTs a bare EHR and parses the ehr_id from the Location header", async () => {
    vi.mocked(callEhrbase).mockResolvedValue({
      status: 201,
      etag: null,
      location: `http://ehrbase/x/ehr/${EHR_ID}`,
      json: null,
    });

    const res = await createEhrImpl({});

    expect(res.ehrId).toBe(EHR_ID);
    const opts = vi.mocked(callEhrbase).mock.calls[0]?.[1];
    expect(opts?.method).toBe("POST");
    expect(opts?.path).toBe("ehr");
    expect(opts?.classifyPath).toBe("ehr");
    expect(opts?.body).toBeUndefined();
  });

  it("sends a rule-12 PARTY_SELF external_ref EHR_STATUS body when given a subject", async () => {
    vi.mocked(callEhrbase).mockResolvedValue({
      status: 201,
      etag: null,
      location: `http://ehrbase/x/ehr/${EHR_ID}`,
      json: null,
    });

    await createEhrImpl({ subject: { namespace: "hospital-mrn", id: "P-42" } });

    const opts = vi.mocked(callEhrbase).mock.calls[0]?.[1];
    expect(opts?.contentType).toBe(JSON_CT);
    const body = z.looseObject({}).parse(JSON.parse(opts?.body ?? "{}"));
    const subject = z
      .object({
        external_ref: z.object({
          namespace: z.string(),
          type: z.string(),
          id: z.object({ value: z.string() }),
        }),
      })
      .parse(body["subject"]);
    expect(subject.external_ref.namespace).toBe("hospital-mrn");
    expect(subject.external_ref.type).toBe("PERSON");
    expect(subject.external_ref.id.value).toBe("P-42");
    expect(body["is_queryable"]).toBe(true);
  });
});

describe("fetchEhr", () => {
  it("extracts ehr_id / system_id / time_created from the canonical EHR", async () => {
    vi.mocked(callEhrbase).mockResolvedValue({
      status: 200,
      etag: null,
      location: null,
      json: {
        ehr_id: { value: EHR_ID },
        system_id: { value: "local.ehrbase.org" },
        time_created: { value: "2026-05-30T10:00:00Z" },
      },
    });

    const res = await fetchEhr({ ehrId: EHR_ID });

    expect(res).toEqual({
      ehrId: EHR_ID,
      systemId: "local.ehrbase.org",
      timeCreated: "2026-05-30T10:00:00Z",
    });
    const opts = vi.mocked(callEhrbase).mock.calls[0]?.[1];
    expect(opts?.method).toBe("GET");
    expect(opts?.path).toBe(`ehr/${EHR_ID}`);
  });
});

describe("fetchEhrStatus", () => {
  it("returns the status as a JSON string + version_uid from the ETag", async () => {
    const status = { _type: "EHR_STATUS", is_modifiable: true, is_queryable: true };
    vi.mocked(callEhrbase).mockResolvedValue({
      status: 200,
      etag: '"st-obj::local.ehrbase.org::1"',
      location: null,
      json: status,
    });

    const res = await fetchEhrStatus({ ehrId: EHR_ID });

    expect(res.versionUid).toBe("st-obj::local.ehrbase.org::1");
    expect(JSON.parse(res.ehrStatus)).toEqual(status);
    expect(vi.mocked(callEhrbase).mock.calls[0]?.[1].path).toBe(`ehr/${EHR_ID}/ehr_status`);
  });
});

describe("reviseEhrStatus", () => {
  it("PUTs with a BARE If-Match version_uid (EHRbase 2.31 quirk — quoted 400s)", async () => {
    vi.mocked(callEhrbase).mockResolvedValue({
      status: 200,
      etag: '"st-obj::local.ehrbase.org::2"',
      location: null,
      json: null,
    });

    const res = await reviseEhrStatus({
      ehrId: EHR_ID,
      versionUid: "st-obj::local.ehrbase.org::1",
      ehrStatus: { _type: "EHR_STATUS", is_modifiable: false, is_queryable: true },
    });

    expect(res.versionUid).toBe("st-obj::local.ehrbase.org::2");
    const opts = vi.mocked(callEhrbase).mock.calls[0]?.[1];
    expect(opts?.method).toBe("PUT");
    expect(opts?.path).toBe(`ehr/${EHR_ID}/ehr_status`);
    expect(opts?.ifMatch).toBe("st-obj::local.ehrbase.org::1");
  });
});
