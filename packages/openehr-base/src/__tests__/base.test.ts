import { describe, expect, it } from "vitest";
import { z } from "zod";

import specManifest from "../../spec.json";
import {
  ACCESS_GROUP_REF,
  Interval,
  LOCATABLE_REF,
  OBJECT_ID,
  OBJECT_REF,
  OBJECT_VERSION_ID,
  PARTY_REF,
  SPEC_COMPONENT,
  SPEC_VERSION,
  TERMINOLOGY_CODE,
  UID_BASED_ID,
  UUID,
} from "../index.ts";

describe("spec coordinates", () => {
  it("pins BASE 1.1.0 (matches EHRbase 2.31.0 / RM 1.1.0)", () => {
    expect(SPEC_COMPONENT).toBe("BASE");
    expect(SPEC_VERSION).toBe("1.1.0");
  });

  it("keeps spec.ts in sync with spec.json (future-version guard)", () => {
    expect(SPEC_COMPONENT).toBe(specManifest.component);
    expect(SPEC_VERSION).toBe(specManifest.specVersion);
  });
});

describe("generated leaf schemas", () => {
  it("parses an OBJECT_VERSION_ID", () => {
    expect(
      OBJECT_VERSION_ID.safeParse({ value: "abc::node::1", _type: "OBJECT_VERSION_ID" })
        .success,
    ).toBe(true);
  });

  it("parses a UUID and rejects a missing value", () => {
    expect(UUID.safeParse({ value: "550e8400-e29b-41d4-a716-446655440000" }).success).toBe(true);
    expect(UUID.safeParse({}).success).toBe(false);
  });

  it("parses a TERMINOLOGY_CODE and enforces the spec-required fields", () => {
    // `uri` is a $ref to the BASE URI type (an object) — the custom generator
    // resolves it faithfully (json-schema-to-zod had flattened it to z.any()).
    expect(
      TERMINOLOGY_CODE.safeParse({
        terminology_id: "SNOMED-CT",
        code_string: "73211009",
        uri: { _type: "URI" },
      }).success,
    ).toBe(true);
    // `uri` is required by BASE 1.1.0 — the generated schema enforces it.
    expect(
      TERMINOLOGY_CODE.safeParse({ terminology_id: "SNOMED-CT", code_string: "73211009" }).success,
    ).toBe(false);
  });
});

describe("OBJECT_ID polymorphism (hand-stitched discriminated union)", () => {
  it("accepts each concrete id type by _type", () => {
    expect(OBJECT_ID.safeParse({ value: "x", _type: "HIER_OBJECT_ID" }).success).toBe(true);
    expect(OBJECT_ID.safeParse({ value: "x", _type: "OBJECT_VERSION_ID" }).success).toBe(true);
    expect(
      OBJECT_ID.safeParse({ value: "x", scheme: "uri", _type: "GENERIC_ID" }).success,
    ).toBe(true);
  });

  it("rejects an unknown _type discriminant", () => {
    expect(OBJECT_ID.safeParse({ value: "x", _type: "NOT_AN_ID" }).success).toBe(false);
  });

  it("UID_BASED_ID only admits the UID subtypes", () => {
    expect(UID_BASED_ID.safeParse({ value: "x", _type: "HIER_OBJECT_ID" }).success).toBe(true);
    expect(UID_BASED_ID.safeParse({ value: "x", _type: "ARCHETYPE_ID" }).success).toBe(false);
  });
});

describe("object references", () => {
  it("OBJECT_REF round-trips with a TERMINOLOGY_ID id", () => {
    const ref = {
      id: { value: "openehr", _type: "TERMINOLOGY_ID" },
      namespace: "local",
      type: "VALUE_SET",
      _type: "OBJECT_REF",
    };
    const parsed = OBJECT_REF.safeParse(ref);
    expect(parsed.success).toBe(true);
  });

  it("LOCATABLE_REF accepts a UID id + path but rejects a non-UID id", () => {
    expect(
      LOCATABLE_REF.safeParse({
        id: { value: "abc::1", _type: "OBJECT_VERSION_ID" },
        namespace: "local",
        type: "COMPOSITION",
        path: "/content[0]",
      }).success,
    ).toBe(true);
    expect(
      LOCATABLE_REF.safeParse({
        id: { value: "openEHR-EHR-COMPOSITION.encounter.v1", _type: "ARCHETYPE_ID" },
        namespace: "local",
        type: "COMPOSITION",
      }).success,
    ).toBe(false);
  });

  it("PARTY_REF and ACCESS_GROUP_REF carry the full OBJECT_ID union", () => {
    const id = { value: "p1", _type: "GENERIC_ID", scheme: "mrn" };
    expect(PARTY_REF.safeParse({ id, namespace: "demographic", type: "PERSON" }).success).toBe(true);
    expect(
      ACCESS_GROUP_REF.safeParse({ id, namespace: "local", type: "ACCESS_GROUP" }).success,
    ).toBe(true);
  });
});

describe("Interval<T> generic factory", () => {
  it("builds a typed interval schema", () => {
    const NumberInterval = Interval(z.number());
    const result = NumberInterval.safeParse({
      lower: 60,
      upper: 100,
      lower_unbounded: false,
      upper_unbounded: false,
      lower_included: true,
      upper_included: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a wrong bound type", () => {
    const NumberInterval = Interval(z.number());
    expect(
      NumberInterval.safeParse({
        lower: "sixty",
        lower_unbounded: false,
        upper_unbounded: true,
        lower_included: true,
        upper_included: false,
      }).success,
    ).toBe(false);
  });
});
