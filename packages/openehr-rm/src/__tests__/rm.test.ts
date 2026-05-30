import { describe, expect, it } from "vitest";

import specManifest from "../../spec.json";
import {
  CLUSTER,
  CODE_PHRASE,
  COMPOSITION,
  DATA_VALUE,
  DV_CODED_TEXT,
  DV_QUANTITY,
  DV_TEXT,
  ELEMENT,
  ITEM,
  OBSERVATION,
  SPEC_COMPONENT,
  SPEC_VERSION,
} from "../index.ts";

describe("spec coordinates", () => {
  it("pins RM 1.1.0 (matches EHRbase 2.31.0) and stays in sync with spec.json", () => {
    expect(SPEC_COMPONENT).toBe("RM");
    expect(SPEC_VERSION).toBe("1.1.0");
    expect(SPEC_COMPONENT).toBe(specManifest.component);
    expect(SPEC_VERSION).toBe(specManifest.specVersion);
  });
});

describe("data types", () => {
  it("DV_TEXT / DV_QUANTITY / CODE_PHRASE / DV_CODED_TEXT parse", () => {
    expect(DV_TEXT.safeParse({ value: "Headache" }).success).toBe(true);
    expect(DV_QUANTITY.safeParse({ magnitude: 37.2, units: "Cel" }).success).toBe(true);
    expect(DV_QUANTITY.safeParse({ magnitude: 37.2 }).success).toBe(false); // units required
    expect(
      CODE_PHRASE.safeParse({ terminology_id: { value: "SNOMED-CT" }, code_string: "25064002" })
        .success,
    ).toBe(true);
    expect(
      DV_CODED_TEXT.safeParse({
        value: "Appendicitis",
        defining_code: { terminology_id: { value: "SNOMED-CT" }, code_string: "74400008" },
      }).success,
    ).toBe(true);
  });
});

describe("DATA_VALUE abstract union", () => {
  it("admits each concrete leaf and rejects junk", () => {
    expect(DATA_VALUE.safeParse({ magnitude: 1, units: "mg", _type: "DV_QUANTITY" }).success).toBe(
      true,
    );
    expect(DATA_VALUE.safeParse({ value: "free text" }).success).toBe(true);
    expect(DATA_VALUE.safeParse({ not: "a data value" }).success).toBe(false);
  });
});

describe("recursion (the make-or-break for the getter-based generator)", () => {
  const tempElement = {
    archetype_node_id: "at0004",
    name: { value: "Temperature" },
    value: { magnitude: 37.2, units: "Cel", _type: "DV_QUANTITY" },
    _type: "ELEMENT",
  };

  it("ELEMENT with a polymorphic DV_QUANTITY value parses", () => {
    expect(ELEMENT.safeParse(tempElement).success).toBe(true);
  });

  it("ITEM union accepts both CLUSTER and ELEMENT", () => {
    expect(ITEM.safeParse(tempElement).success).toBe(true);
  });

  it("a CLUSTER nested inside a CLUSTER round-trips (self-recursion)", () => {
    const nested = {
      archetype_node_id: "at0001",
      name: { value: "Blood pressure panel" },
      items: [
        {
          archetype_node_id: "at0002",
          name: { value: "Systolic group" },
          items: [tempElement],
          _type: "CLUSTER",
        },
        tempElement,
      ],
      _type: "CLUSTER",
    };
    const parsed = CLUSTER.safeParse(nested);
    expect(parsed.success).toBe(true);
    // round-trip: re-parsing the parsed value is idempotent
    if (parsed.success) {
      expect(CLUSTER.parse(parsed.data)).toEqual(parsed.data);
    }
  });

  it("rejects a CLUSTER missing its required items", () => {
    expect(
      CLUSTER.safeParse({ archetype_node_id: "at0001", name: { value: "x" } }).success,
    ).toBe(false);
  });
});

describe("OBSERVATION schema exists and is strict", () => {
  it("rejects an object with unknown keys", () => {
    expect(OBSERVATION.safeParse({ bogus: true }).success).toBe(false);
  });
});

describe("COMPOSITION (top-level EHR type) round-trips", () => {
  const composition = {
    archetype_node_id: "openEHR-EHR-COMPOSITION.encounter.v1",
    name: { value: "Encounter" },
    language: { terminology_id: { value: "ISO_639-1" }, code_string: "en" },
    territory: { terminology_id: { value: "ISO_3166-1" }, code_string: "NL" },
    category: {
      value: "event",
      defining_code: { terminology_id: { value: "openehr" }, code_string: "433" },
      _type: "DV_CODED_TEXT",
    },
    // Demographics are referenced, never inline (Inviolable rule 12): composer
    // is a PARTY_PROXY pointing at the M7 demographic provider.
    composer: { name: "Dr. Smith", _type: "PARTY_IDENTIFIED" },
    content: [
      {
        archetype_node_id: "openEHR-EHR-SECTION.vitals.v1",
        name: { value: "Vital signs" },
        _type: "SECTION",
      },
    ],
    _type: "COMPOSITION",
  };

  it("parses a full canonical composition and is idempotent", () => {
    const parsed = COMPOSITION.safeParse(composition);
    expect(parsed.success, parsed.success ? "ok" : JSON.stringify(parsed.error?.issues)).toBe(true);
    if (parsed.success) expect(COMPOSITION.parse(parsed.data)).toEqual(parsed.data);
  });

  it("rejects a composition missing required fields (language)", () => {
    const incomplete: Record<string, unknown> = { ...composition };
    delete incomplete.language;
    expect(COMPOSITION.safeParse(incomplete).success).toBe(false);
  });
});
