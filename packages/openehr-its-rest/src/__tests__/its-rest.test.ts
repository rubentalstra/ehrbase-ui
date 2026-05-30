import { describe, expect, it } from "vitest";

import * as itsRest from "../index.ts";
import { SPEC_COMPONENT, SPEC_VERSION } from "../index.ts";

describe("openehr-its-rest", () => {
  it("pins ITS-REST 1.0.3 (the REST surface EHRbase 2.31.0 implements)", () => {
    expect(SPEC_COMPONENT).toBe("ITS-REST");
    expect(SPEC_VERSION).toBe("1.0.3");
  });

  it("exposes the generated API schema modules, namespaced per API group", () => {
    expect(typeof itsRest.ehr).toBe("object");
    expect(typeof itsRest.query).toBe("object");
    expect(typeof itsRest.definition).toBe("object");
    // each namespace carries the orval-generated Zod schemas for that API
    expect(Object.keys(itsRest.query).length).toBeGreaterThan(0);
    expect(Object.keys(itsRest.ehr).length).toBeGreaterThan(0);
    expect(Object.keys(itsRest.definition).length).toBeGreaterThan(0);
  });
});
