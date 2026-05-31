import { describe, expect, it } from "vitest";

import {
  assertRmVersion,
  COMPOSITION,
  guardComposition,
  RmVersionMismatchError,
  rmVersionMatches,
  SPEC_VERSION,
} from "../index.ts";

// A minimal but real-shaped parsed COMPOSITION carrying archetype_details.
// rm_version (the field guardComposition reads). The composer is a PARTY_PROXY
// reference (Inviolable rule 12) — no inline demographics. Returns a genuinely
// parsed COMPOSITION (the guard's input contract), so the test exercises the
// real type, not a loose object.
function composition(rmVersion: string | undefined): COMPOSITION {
  const raw = {
    archetype_node_id: "openEHR-EHR-COMPOSITION.encounter.v1",
    name: { value: "Encounter" },
    ...(rmVersion === undefined
      ? {}
      : {
          archetype_details: {
            archetype_id: { value: "openEHR-EHR-COMPOSITION.encounter.v1" },
            rm_version: rmVersion,
            _type: "ARCHETYPED",
          },
        }),
    language: { terminology_id: { value: "ISO_639-1" }, code_string: "en" },
    territory: { terminology_id: { value: "ISO_3166-1" }, code_string: "NL" },
    category: {
      value: "event",
      defining_code: { terminology_id: { value: "openehr" }, code_string: "433" },
      _type: "DV_CODED_TEXT",
    },
    composer: { name: "Dr. Smith", _type: "PARTY_IDENTIFIED" },
    _type: "COMPOSITION",
  };
  return COMPOSITION.parse(raw);
}

describe("rmVersionMatches — leniency policy", () => {
  it("matches the pinned RM version exactly", () => {
    expect(SPEC_VERSION).toBe("1.1.0");
    expect(rmVersionMatches("1.1.0")).toBe(true);
  });

  it("is lenient on patch (any patch of the pinned major.minor)", () => {
    expect(rmVersionMatches("1.1.0")).toBe(true);
    expect(rmVersionMatches("1.1.4")).toBe(true);
    expect(rmVersionMatches("1.1.99")).toBe(true);
    expect(rmVersionMatches("1.1")).toBe(true); // major.minor with no patch
  });

  it("accepts an OLDER minor on the same major (RM is backward-compatible)", () => {
    // Real EHRbase data carries 1.0.x — must read cleanly against our 1.1.0 schemas.
    expect(rmVersionMatches("1.0.1")).toBe(true);
    expect(rmVersionMatches("1.0.2")).toBe(true);
    expect(rmVersionMatches("1.0.4")).toBe(true);
    expect(rmVersionMatches("1.0")).toBe(true);
  });

  it("REJECTS a NEWER minor on the same major (upgraded-server tripwire)", () => {
    expect(rmVersionMatches("1.2.0")).toBe(false);
    expect(rmVersionMatches("1.2")).toBe(false);
    expect(rmVersionMatches("1.10.0")).toBe(false); // numeric compare, not lexical
  });

  it("REJECTS a different major", () => {
    expect(rmVersionMatches("2.0.0")).toBe(false);
    expect(rmVersionMatches("2.1.0")).toBe(false);
    expect(rmVersionMatches("0.9.0")).toBe(false);
  });

  it("REJECTS malformed / empty version strings", () => {
    expect(rmVersionMatches("")).toBe(false);
    expect(rmVersionMatches("   ")).toBe(false);
    expect(rmVersionMatches("1")).toBe(false); // no minor
    expect(rmVersionMatches("v1.1.0")).toBe(false);
    expect(rmVersionMatches("1.1.0-beta")).toBe(false);
    expect(rmVersionMatches("latest")).toBe(false);
    expect(rmVersionMatches("1.x")).toBe(false);
  });

  it("tolerates surrounding whitespace", () => {
    expect(rmVersionMatches("  1.1.0  ")).toBe(true);
  });
});

describe("assertRmVersion", () => {
  it("does not throw for a supported version", () => {
    expect(() => assertRmVersion("1.1.0")).not.toThrow();
    expect(() => assertRmVersion("1.0.4")).not.toThrow();
  });

  it("throws a typed RmVersionMismatchError carrying both versions (no PHI)", () => {
    let caught: unknown;
    try {
      assertRmVersion("1.2.0");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RmVersionMismatchError);
    if (caught instanceof RmVersionMismatchError) {
      expect(caught.name).toBe("RmVersionMismatchError");
      expect(caught.actualRmVersion).toBe("1.2.0");
      expect(caught.expectedRmVersion).toBe("1.1.0");
      // No PHI: the message mentions only RM versions, never data.
      expect(caught.message).toContain("1.2.0");
      expect(caught.message).toContain("1.1.0");
    }
  });

  it("reports an empty version as <missing>", () => {
    expect(() => assertRmVersion("")).toThrow(RmVersionMismatchError);
    try {
      assertRmVersion("");
    } catch (error) {
      if (error instanceof RmVersionMismatchError) {
        expect(error.actualRmVersion).toBe("<missing>");
      }
    }
  });
});

describe("guardComposition", () => {
  it("passes a composition whose rm_version is supported", () => {
    expect(() => guardComposition(composition("1.1.0"))).not.toThrow();
    expect(() => guardComposition(composition("1.0.4"))).not.toThrow();
  });

  it("throws for a composition from a newer RM", () => {
    expect(() => guardComposition(composition("1.2.0"))).toThrow(RmVersionMismatchError);
    try {
      guardComposition(composition("1.2.0"));
    } catch (error) {
      if (error instanceof RmVersionMismatchError) {
        expect(error.actualRmVersion).toBe("1.2.0");
      }
    }
  });

  it("fails closed when archetype_details / rm_version is missing", () => {
    let caught: unknown;
    try {
      guardComposition(composition(undefined));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RmVersionMismatchError);
    if (caught instanceof RmVersionMismatchError) {
      expect(caught.actualRmVersion).toBe("<missing>");
    }
  });
});
