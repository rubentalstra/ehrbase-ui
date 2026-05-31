import { describe, expect, it } from "vitest";

import {
  formatDvCodedText,
  formatDvDate,
  formatDvDateTime,
  formatDvOrdinal,
  formatDvProportion,
  formatDvQuantity,
  formatPartyProxy,
  isElementNull,
  NULL_FLAVOUR_CODE,
  nullFlavourCode,
  nullFlavourRubric,
} from "../index.ts";

describe("null-flavour helpers", () => {
  const nullElement = {
    archetype_node_id: "at0004",
    name: { value: "Temperature" },
    null_flavour: {
      value: "no information",
      defining_code: { terminology_id: { value: "openehr" }, code_string: "271" },
      _type: "DV_CODED_TEXT",
    },
    _type: "ELEMENT",
  };

  const valuedElement = {
    archetype_node_id: "at0004",
    name: { value: "Temperature" },
    value: { magnitude: 37.2, units: "Cel", _type: "DV_QUANTITY" },
    _type: "ELEMENT",
  };

  it("exposes the four standard null-flavour codes", () => {
    expect(NULL_FLAVOUR_CODE.UNKNOWN).toBe("253");
    expect(NULL_FLAVOUR_CODE.NO_INFORMATION).toBe("271");
    expect(NULL_FLAVOUR_CODE.MASKED).toBe("272");
    expect(NULL_FLAVOUR_CODE.NOT_APPLICABLE).toBe("273");
  });

  it("isElementNull: true when value absent + null_flavour present", () => {
    expect(isElementNull(nullElement)).toBe(true);
  });

  it("isElementNull: false when a value is present", () => {
    expect(isElementNull(valuedElement)).toBe(false);
  });

  it("isElementNull: false when neither value nor null_flavour present (merely empty)", () => {
    expect(isElementNull({ archetype_node_id: "at0004", name: { value: "x" } })).toBe(false);
  });

  it("isElementNull: false when both value and null_flavour present", () => {
    expect(
      isElementNull({
        archetype_node_id: "at0004",
        name: { value: "x" },
        value: { magnitude: 1, units: "mg" },
        null_flavour: { value: "unknown", defining_code: { code_string: "253" } },
      }),
    ).toBe(false);
  });

  it("nullFlavourCode: reads the defining code, else null", () => {
    expect(nullFlavourCode(nullElement)).toBe("271");
    expect(nullFlavourCode(valuedElement)).toBe(null);
  });

  it("nullFlavourRubric: resolves via openEHR TERM NULL_FLAVOURS", () => {
    expect(nullFlavourRubric("271")).toBe("no information");
    expect(nullFlavourRubric("253")).toBe("unknown");
    expect(nullFlavourRubric("272")).toBe("masked");
    expect(nullFlavourRubric("273")).toBe("not applicable");
  });

  it("nullFlavourRubric: null for an unrecognised code", () => {
    expect(nullFlavourRubric("999")).toBe(null);
    expect(nullFlavourRubric("")).toBe(null);
  });
});

describe("formatDvQuantity", () => {
  it("formats magnitude + units", () => {
    expect(formatDvQuantity({ magnitude: 70.5, units: "kg" })).toBe("70.5 kg");
    expect(formatDvQuantity({ magnitude: 37.2, units: "Cel" })).toBe("37.2 Cel");
  });

  it("respects precision (decimal places)", () => {
    expect(formatDvQuantity({ magnitude: 70.5, units: "kg", precision: 0 })).toBe("71 kg");
    expect(formatDvQuantity({ magnitude: 70.5, units: "kg", precision: 2 })).toBe("70.50 kg");
    expect(formatDvQuantity({ magnitude: 200, units: "mg/dL", precision: 0 })).toBe("200 mg/dL");
  });

  it("handles empty units", () => {
    expect(formatDvQuantity({ magnitude: 5, units: "" })).toBe("5");
  });

  it("falls back to empty string on malformed input", () => {
    expect(formatDvQuantity({ magnitude: 5 })).toBe(""); // units required
    expect(formatDvQuantity({ units: "kg" })).toBe(""); // magnitude required
    expect(formatDvQuantity(null)).toBe("");
    expect(formatDvQuantity("70.5 kg")).toBe("");
  });
});

describe("formatDvCodedText", () => {
  it("prefers the human value (rubric)", () => {
    expect(
      formatDvCodedText({
        value: "Appendicitis",
        defining_code: { terminology_id: { value: "SNOMED-CT" }, code_string: "74400008" },
      }),
    ).toBe("Appendicitis");
  });

  it("falls back to the code when value is absent/empty", () => {
    expect(formatDvCodedText({ defining_code: { code_string: "74400008" } })).toBe("74400008");
    expect(formatDvCodedText({ value: "", defining_code: { code_string: "74400008" } })).toBe(
      "74400008",
    );
  });

  it("falls back to empty string with neither value nor code", () => {
    expect(formatDvCodedText({})).toBe("");
    expect(formatDvCodedText(null)).toBe("");
  });
});

describe("formatDvProportion", () => {
  it("renders percent (type 2) as n%", () => {
    expect(formatDvProportion({ numerator: 89.21, denominator: 100, type: 2 })).toBe("89.21%");
  });

  it("renders other kinds as n/d", () => {
    expect(formatDvProportion({ numerator: 1, denominator: 3, type: 3 })).toBe("1/3"); // fraction
    expect(formatDvProportion({ numerator: 2, denominator: 5, type: 0 })).toBe("2/5"); // ratio
    expect(formatDvProportion({ numerator: 4, denominator: 1, type: 1 })).toBe("4/1"); // unitary
  });

  it("defaults to n/d when type is absent", () => {
    expect(formatDvProportion({ numerator: 1, denominator: 4 })).toBe("1/4");
  });

  it("falls back to empty string on malformed input", () => {
    expect(formatDvProportion({ numerator: 1 })).toBe("");
    expect(formatDvProportion(null)).toBe("");
  });
});

describe("formatDvOrdinal", () => {
  it("renders the symbol's display text (rubric)", () => {
    expect(
      formatDvOrdinal({
        value: 2,
        symbol: {
          value: "Moderate",
          defining_code: { terminology_id: { value: "local" }, code_string: "at0003" },
        },
      }),
    ).toBe("Moderate");
  });

  it("falls back to the symbol code, then the numeric value", () => {
    expect(formatDvOrdinal({ value: 2, symbol: { defining_code: { code_string: "at0003" } } })).toBe(
      "at0003",
    );
    expect(formatDvOrdinal({ value: 2 })).toBe("2");
  });

  it("works for DV_SCALE (numeric value, decimal)", () => {
    expect(formatDvOrdinal({ value: 1.5 })).toBe("1.5");
  });

  it("falls back to empty string on malformed input", () => {
    expect(formatDvOrdinal({})).toBe("");
    expect(formatDvOrdinal(null)).toBe("");
  });
});

describe("formatDvDate", () => {
  it("returns a full ISO date verbatim", () => {
    expect(formatDvDate("2020-10-26")).toBe("2020-10-26");
  });

  it("handles partial dates gracefully", () => {
    expect(formatDvDate("2020")).toBe("2020");
    expect(formatDvDate("2020-10")).toBe("2020-10");
  });

  it("trims whitespace and falls back on non-strings", () => {
    expect(formatDvDate("  2020-10-26  ")).toBe("2020-10-26");
    expect(formatDvDate(null)).toBe("");
    expect(formatDvDate(20201026)).toBe("");
  });
});

describe("formatDvDateTime", () => {
  it("returns the ISO value as-is when no tz abbr supplied", () => {
    expect(formatDvDateTime("2020-10-26T15:39:53.668+01:00")).toBe(
      "2020-10-26T15:39:53.668+01:00",
    );
  });

  it("appends the timezone abbreviation when supplied (architecture.md §12.2)", () => {
    expect(
      formatDvDateTime("2020-10-26T15:39:53.668+01:00", { timeZoneAbbr: "CET" }),
    ).toBe("2020-10-26T15:39:53.668+01:00 CET");
    expect(formatDvDateTime("2020-10-26T14:39:53.668Z", { timeZoneAbbr: "UTC" })).toBe(
      "2020-10-26T14:39:53.668Z UTC",
    );
  });

  it("ignores an empty/whitespace tz abbr", () => {
    expect(formatDvDateTime("2020-10-26T15:39:53Z", { timeZoneAbbr: "" })).toBe(
      "2020-10-26T15:39:53Z",
    );
    expect(formatDvDateTime("2020-10-26T15:39:53Z", { timeZoneAbbr: "  " })).toBe(
      "2020-10-26T15:39:53Z",
    );
  });

  it("handles partial date-times gracefully", () => {
    expect(formatDvDateTime("2020-10-26T15:39", { timeZoneAbbr: "CET" })).toBe(
      "2020-10-26T15:39 CET",
    );
  });

  it("falls back to empty string on malformed input", () => {
    expect(formatDvDateTime(null)).toBe("");
    expect(formatDvDateTime("", { timeZoneAbbr: "CET" })).toBe("");
  });
});

describe("formatPartyProxy", () => {
  it("prefers the PARTY_IDENTIFIED name", () => {
    expect(
      formatPartyProxy({
        _type: "PARTY_IDENTIFIED",
        name: "Dr. Yamamoto",
        external_ref: {
          _type: "PARTY_REF",
          id: { _type: "HIER_OBJECT_ID", value: "a3dce0d4-fa51-4ff2-9cce-93dd60437842" },
          namespace: "DEMOGRAPHIC",
          type: "PERSON",
        },
      }),
    ).toBe("Dr. Yamamoto");
  });

  it("falls back to the external reference as namespace:id (M7 pointer)", () => {
    expect(
      formatPartyProxy({
        _type: "PARTY_IDENTIFIED",
        external_ref: {
          _type: "PARTY_REF",
          id: { _type: "GENERIC_ID", value: "1", scheme: "TH-HIS-MPI" },
          namespace: "patients",
          type: "PERSON",
        },
      }),
    ).toBe("patients:1");
  });

  it("falls back to the _type (e.g. PARTY_SELF)", () => {
    expect(formatPartyProxy({ _type: "PARTY_SELF" })).toBe("PARTY_SELF");
  });

  it("falls back to empty string on malformed input", () => {
    expect(formatPartyProxy(null)).toBe("");
    expect(formatPartyProxy({})).toBe("");
  });
});
