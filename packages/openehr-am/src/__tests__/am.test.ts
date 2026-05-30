import { describe, expect, it } from "vitest";

import {
  formatArchetypeId,
  isAcCode,
  isArchetypeId,
  isAtCode,
  parseArchetypeId,
  specialisationDepth,
  SPEC_COMPONENT,
  SPEC_VERSION,
} from "../index.ts";

describe("spec coordinates", () => {
  it("pins ADL 1.4 (matches EHRbase 2.31.0)", () => {
    expect(SPEC_COMPONENT).toBe("AM");
    expect(SPEC_VERSION).toBe("ADL-1.4");
  });
});

describe("parseArchetypeId", () => {
  it("decomposes a well-formed ADL 1.4 archetype id", () => {
    expect(parseArchetypeId("openEHR-EHR-OBSERVATION.blood_pressure.v2")).toEqual({
      value: "openEHR-EHR-OBSERVATION.blood_pressure.v2",
      rmPublisher: "openEHR",
      rmPackage: "EHR",
      rmClass: "OBSERVATION",
      conceptId: "blood_pressure",
      versionMajor: 2,
    });
  });

  it("handles underscored RM classes and specialised concepts", () => {
    expect(parseArchetypeId("openEHR-EHR-ADMIN_ENTRY.admission.v1")?.rmClass).toBe("ADMIN_ENTRY");
    expect(parseArchetypeId("openEHR-EHR-CLUSTER.person_name-full.v0")?.conceptId).toBe(
      "person_name-full",
    );
  });

  it("rejects malformed ids", () => {
    expect(parseArchetypeId("not-an-archetype")).toBeNull();
    expect(parseArchetypeId("openEHR-EHR-OBSERVATION.blood_pressure")).toBeNull(); // no version
    expect(isArchetypeId("openEHR-EHR-OBSERVATION.bp.v1")).toBe(true);
    expect(isArchetypeId("openEHR-EHR-OBSERVATION.bp.vX")).toBe(false);
  });

  it("formatArchetypeId is the inverse of the parsed parts", () => {
    const id = "openEHR-EHR-COMPOSITION.encounter.v1";
    const parsed = parseArchetypeId(id);
    expect(parsed).not.toBeNull();
    if (parsed) {
      expect(
        formatArchetypeId({
          rmPublisher: parsed.rmPublisher,
          rmPackage: parsed.rmPackage,
          rmClass: parsed.rmClass,
          conceptId: parsed.conceptId,
          versionMajor: parsed.versionMajor,
        }),
      ).toBe(id);
    }
  });
});

describe("node codes", () => {
  it("recognises at-codes and ac-codes", () => {
    expect(isAtCode("at0001")).toBe(true);
    expect(isAtCode("at0001.1")).toBe(true);
    expect(isAtCode("ac0001")).toBe(false);
    expect(isAcCode("ac0001")).toBe(true);
    expect(isAtCode("id1")).toBe(false);
  });

  it("computes specialisation depth", () => {
    expect(specialisationDepth("at0001")).toBe(0);
    expect(specialisationDepth("at0001.1")).toBe(1);
    expect(specialisationDepth("at0001.0.2")).toBe(2);
    expect(specialisationDepth("nope")).toBe(-1);
  });
});
