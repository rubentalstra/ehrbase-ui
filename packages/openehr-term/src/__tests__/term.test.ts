import { describe, expect, it } from "vitest";

import {
  AUDIT_CHANGE_TYPE,
  COMPOSITION_CATEGORY,
  NORMAL_STATUSES,
  NULL_FLAVOURS,
  SETTING,
  SPEC_COMPONENT,
  SPEC_VERSION,
  SUBJECT_RELATIONSHIP,
} from "../index.ts";

describe("spec coordinates", () => {
  it("pins TERM 3.0.0", () => {
    expect(SPEC_COMPONENT).toBe("TERM");
    expect(SPEC_VERSION).toBe("3.0.0");
  });
});

describe("openEHR terminology groups (code → rubric)", () => {
  it("composition category", () => {
    expect(COMPOSITION_CATEGORY["433"]).toBe("event");
    expect(COMPOSITION_CATEGORY["431"]).toBe("persistent");
    expect(COMPOSITION_CATEGORY["435"]).toBe("episodic");
  });

  it("null flavours", () => {
    expect(NULL_FLAVOURS["271"]).toBe("no information");
    expect(NULL_FLAVOURS["253"]).toBe("unknown");
    expect(NULL_FLAVOURS["272"]).toBe("masked");
  });

  it("setting + audit change type + subject relationship", () => {
    expect(SETTING["238"]).toBe("other care");
    expect(SETTING["225"]).toBe("home");
    expect(AUDIT_CHANGE_TYPE["249"]).toBe("creation");
    expect(SUBJECT_RELATIONSHIP["0"]).toBe("self");
  });
});

describe("openEHR codesets", () => {
  it("normal statuses", () => {
    expect(NORMAL_STATUSES).toContain("N");
    expect(NORMAL_STATUSES).toContain("HHH");
    expect(NORMAL_STATUSES).toHaveLength(7);
  });
});
