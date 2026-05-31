// F3 round-trip tests: null_flavour + reference_range (normal_range) + DV_INTERVAL lenient.
//
// Spec §7 library-completeness items:
//   (a) A null-flavoured leaf survives form-state → FLAT → form-state
//       AND structured → form-state, and is NOT confused with a zero value.
//   (b) A DV_QUANTITY with normal_range survives FLAT → form-state read-back
//       with the range preserved as `_normal_range` metadata.
//   (c) normal_range round-trips (FLAT read-back through form-state, then
//       form-state → FLAT re-emits the `_normal_range` keys faithfully).
//
// FLAT key conventions (EHRbase simSDT, verified against spec):
//   null_flavour:  <path>/_null_flavour|code, /_null_flavour|value, /_null_flavour|terminology
//   normal_range:  <path>/_normal_range/lower|magnitude, /_normal_range/lower|unit,
//                  <path>/_normal_range/upper|magnitude, /_normal_range/upper|unit,
//                  <path>/_normal_range/lower_unbounded, /_normal_range/upper_unbounded,
//                  <path>/_normal_range/lower_included, /_normal_range/upper_included

import { describe, expect, it } from "vitest";
import { WebTemplate } from "@ehrbase-ui/openehr-web-template";
import { flatToFormState, formStateToFlat, structuredToFormState } from "../index.ts";

// ── Shared template factory ──────────────────────────────────────────────────

function makeTemplate(child: unknown) {
  return WebTemplate.parse({
    templateId: "f3.test.v1",
    defaultLanguage: "en",
    languages: ["en"],
    tree: { id: "root", rmType: "COMPOSITION", min: 1, max: 1, children: [child] },
  });
}

// ── Templates ────────────────────────────────────────────────────────────────

// DV_QUANTITY — the primary type for normal_range.
const quantityTemplate = makeTemplate({
  id: "glucose",
  rmType: "DV_QUANTITY",
  min: 0,
  max: 1,
  inputs: [
    { suffix: "magnitude", type: "DECIMAL" },
    { suffix: "unit", type: "CODED_TEXT", list: [{ value: "mmol/L" }] },
  ],
});

// DV_TEXT — scalar leaf, used for null_flavour tests (null_flavour applies to
// any ELEMENT, regardless of rmType).
const textTemplate = makeTemplate({
  id: "note",
  rmType: "DV_TEXT",
  min: 0,
  max: 1,
  inputs: [{ type: "TEXT" }],
});

// DV_COUNT — integer leaf, also carries normal_range.
const countTemplate = makeTemplate({
  id: "score",
  rmType: "DV_COUNT",
  min: 0,
  max: 1,
  inputs: [{ type: "INTEGER" }],
});

// ── null_flavour round-trip ───────────────────────────────────────────────────

describe("null_flavour — formStateToFlat", () => {
  it("emits _null_flavour|code and NOT the value key for a null-flavoured DV_QUANTITY", () => {
    const formState = {
      glucose: {
        _null_flavour: "253",
        _null_flavour_value: "unknown",
        _null_flavour_terminology: "openehr",
      },
    };
    const flat = formStateToFlat(quantityTemplate, formState);

    // Must emit _null_flavour keys.
    expect(flat["root/glucose/_null_flavour|code"]).toBe("253");
    expect(flat["root/glucose/_null_flavour|value"]).toBe("unknown");
    expect(flat["root/glucose/_null_flavour|terminology"]).toBe("openehr");

    // Must NOT emit any value keys.
    const valueKeys = Object.keys(flat).filter(
      (k) => k.startsWith("root/glucose|") || k === "root/glucose",
    );
    expect(valueKeys).toHaveLength(0);
  });

  it("emits _null_flavour|code for a null-flavoured DV_TEXT (scalar leaf)", () => {
    const formState = {
      note: {
        _null_flavour: "271",
        _null_flavour_value: "no information",
        _null_flavour_terminology: "openehr",
      },
    };
    const flat = formStateToFlat(textTemplate, formState);
    expect(flat["root/note/_null_flavour|code"]).toBe("271");
    expect(flat["root/note/_null_flavour|value"]).toBe("no information");
    // Must NOT emit |value key for the text content.
    expect(flat["root/note|value"]).toBeUndefined();
  });

  it("does NOT confuse null_flavour with a zero-value DV_COUNT", () => {
    // Zero (0) is a valid clinical value — it must NOT produce null_flavour keys.
    const flat = formStateToFlat(countTemplate, { score: 0 });
    expect(flat["root/score|magnitude"]).toBe(0);
    const nfKeys = Object.keys(flat).filter((k) => k.includes("_null_flavour"));
    expect(nfKeys).toHaveLength(0);
  });
});

describe("null_flavour — flatToFormState round-trip", () => {
  it("recovers _null_flavour form-state from FLAT keys (DV_QUANTITY)", () => {
    const flat = {
      "root/glucose/_null_flavour|code": "253",
      "root/glucose/_null_flavour|value": "unknown",
      "root/glucose/_null_flavour|terminology": "openehr",
    };
    const formState = flatToFormState(quantityTemplate, flat);
    const glucose = formState["glucose"];
    expect(glucose).toEqual({
      _null_flavour: "253",
      _null_flavour_value: "unknown",
      _null_flavour_terminology: "openehr",
    });
  });

  it("recovers _null_flavour form-state from FLAT keys (DV_TEXT)", () => {
    const flat = {
      "root/note/_null_flavour|code": "271",
      "root/note/_null_flavour|value": "no information",
      "root/note/_null_flavour|terminology": "openehr",
    };
    const formState = flatToFormState(textTemplate, flat);
    expect(formState["note"]).toEqual({
      _null_flavour: "271",
      _null_flavour_value: "no information",
      _null_flavour_terminology: "openehr",
    });
  });

  it("full round-trip: null-flavoured DV_QUANTITY → formStateToFlat → flatToFormState", () => {
    const input = {
      glucose: {
        _null_flavour: "253",
        _null_flavour_value: "unknown",
        _null_flavour_terminology: "openehr",
      },
    };
    const flat = formStateToFlat(quantityTemplate, input);
    const recovered = flatToFormState(quantityTemplate, flat);
    expect(recovered["glucose"]).toEqual(input["glucose"]);
  });

  it("null_flavour code '253' (unknown) is distinct from magnitude=0", () => {
    // null_flavour and zero must not be confused in either direction.
    const nullFlat = {
      "root/glucose/_null_flavour|code": "253",
    };
    const zeroFlat = {
      "root/glucose|magnitude": 0,
      "root/glucose|unit": "mmol/L",
    };
    const nullState = flatToFormState(quantityTemplate, nullFlat);
    const zeroState = flatToFormState(quantityTemplate, zeroFlat);

    expect((nullState["glucose"] as Record<string, unknown>)["_null_flavour"]).toBe("253");
    expect((nullState["glucose"] as Record<string, unknown>)["magnitude"]).toBeUndefined();

    expect((zeroState["glucose"] as Record<string, unknown>)["magnitude"]).toBe(0);
    expect((zeroState["glucose"] as Record<string, unknown>)["_null_flavour"]).toBeUndefined();
  });
});

describe("null_flavour — structuredToFormState round-trip", () => {
  it("recovers _null_flavour from STRUCTURED element object (DV_QUANTITY)", () => {
    // EHRbase STRUCTURED format encodes null_flavour as `_null_flavour|code` etc.
    // in the element object alongside (absent) `|magnitude` / `|unit`.
    const structured = {
      root: {
        glucose: [
          {
            "_null_flavour|code": "253",
            "_null_flavour|value": "unknown",
            "_null_flavour|terminology": "openehr",
          },
        ],
      },
    };
    const formState = structuredToFormState(quantityTemplate, structured);
    expect(formState["glucose"]).toEqual({
      _null_flavour: "253",
      _null_flavour_value: "unknown",
      _null_flavour_terminology: "openehr",
    });
  });

  it("recovers _null_flavour from STRUCTURED element object (DV_TEXT scalar)", () => {
    const structured = {
      root: {
        note: [
          {
            "_null_flavour|code": "271",
            "_null_flavour|value": "no information",
            "_null_flavour|terminology": "openehr",
          },
        ],
      },
    };
    const formState = structuredToFormState(textTemplate, structured);
    expect(formState["note"]).toEqual({
      _null_flavour: "271",
      _null_flavour_value: "no information",
      _null_flavour_terminology: "openehr",
    });
  });

  it("does NOT set _null_flavour when element has a value (no false positive)", () => {
    const structured = {
      root: {
        glucose: [{ "|magnitude": 5.4, "|unit": "mmol/L" }],
      },
    };
    const formState = structuredToFormState(quantityTemplate, structured);
    const glucose = formState["glucose"] as Record<string, unknown>;
    expect(glucose["_null_flavour"]).toBeUndefined();
    expect(glucose["magnitude"]).toBe(5.4);
  });
});

// ── normal_range (reference range) read-round-trip ───────────────────────────

describe("normal_range — flatToFormState read-back", () => {
  it("recovers _normal_range metadata on a DV_QUANTITY leaf", () => {
    const flat = {
      "root/glucose|magnitude": 5.4,
      "root/glucose|unit": "mmol/L",
      "root/glucose/_normal_range/lower|magnitude": 3.9,
      "root/glucose/_normal_range/lower|unit": "mmol/L",
      "root/glucose/_normal_range/upper|magnitude": 6.1,
      "root/glucose/_normal_range/upper|unit": "mmol/L",
      "root/glucose/_normal_range/lower_unbounded": false,
      "root/glucose/_normal_range/upper_unbounded": false,
      "root/glucose/_normal_range/lower_included": true,
      "root/glucose/_normal_range/upper_included": true,
    };
    const formState = flatToFormState(quantityTemplate, flat);
    const glucose = formState["glucose"] as Record<string, unknown>;

    // The value attributes must be present.
    expect(glucose["magnitude"]).toBe(5.4);
    expect(glucose["unit"]).toBe("mmol/L");

    // The range metadata must be attached.
    const range = glucose["_normal_range"] as Record<string, unknown>;
    expect(range).toBeDefined();
    const lower = range["lower"] as Record<string, unknown>;
    const upper = range["upper"] as Record<string, unknown>;
    expect(lower["magnitude"]).toBe(3.9);
    expect(lower["unit"]).toBe("mmol/L");
    expect(upper["magnitude"]).toBe(6.1);
    expect(upper["unit"]).toBe("mmol/L");
    expect(range["lower_unbounded"]).toBe(false);
    expect(range["upper_unbounded"]).toBe(false);
    expect(range["lower_included"]).toBe(true);
    expect(range["upper_included"]).toBe(true);
  });

  it("_normal_range on a scalar DV_COUNT leaf is silently dropped (not attached to scalar)", () => {
    // DV_COUNT is a scalar leaf — its form-state is a plain number.
    // _normal_range metadata on scalar leaves cannot be attached to the scalar
    // value itself. The converter silently drops it: M10 lab flagging reads
    // reference ranges from the RM-layer (DV_QUANTITY.normal_range on the
    // canonical value), not from the FLAT form-state of scalar leaves.
    // This is the documented scope: normal_range is preserved ONLY for composite
    // leaves (DV_QUANTITY). See convert.ts header.
    const flat = {
      "root/score|magnitude": 2,
      "root/score/_normal_range/lower|magnitude": 0,
      "root/score/_normal_range/upper|magnitude": 4,
      "root/score/_normal_range/lower_unbounded": false,
      "root/score/_normal_range/upper_unbounded": false,
    };
    const formState = flatToFormState(countTemplate, flat);
    // The scalar value is still recovered correctly.
    expect(formState["score"]).toBe(2);
  });
});

describe("normal_range — formStateToFlat pass-through (round-trip write)", () => {
  it("re-emits _normal_range FLAT keys when form-state carries _normal_range metadata", () => {
    const formState = {
      glucose: {
        magnitude: 5.4,
        unit: "mmol/L",
        _normal_range: {
          lower: { magnitude: 3.9, unit: "mmol/L" },
          upper: { magnitude: 6.1, unit: "mmol/L" },
          lower_unbounded: false,
          upper_unbounded: false,
          lower_included: true,
          upper_included: true,
        },
      },
    };
    const flat = formStateToFlat(quantityTemplate, formState);

    // Value keys must be present.
    expect(flat["root/glucose|magnitude"]).toBe(5.4);
    expect(flat["root/glucose|unit"]).toBe("mmol/L");

    // Range keys must be re-emitted.
    expect(flat["root/glucose/_normal_range/lower|magnitude"]).toBe(3.9);
    expect(flat["root/glucose/_normal_range/lower|unit"]).toBe("mmol/L");
    expect(flat["root/glucose/_normal_range/upper|magnitude"]).toBe(6.1);
    expect(flat["root/glucose/_normal_range/upper|unit"]).toBe("mmol/L");
    expect(flat["root/glucose/_normal_range/lower_unbounded"]).toBe(false);
    expect(flat["root/glucose/_normal_range/upper_unbounded"]).toBe(false);
    expect(flat["root/glucose/_normal_range/lower_included"]).toBe(true);
    expect(flat["root/glucose/_normal_range/upper_included"]).toBe(true);
  });

  it("full range round-trip: FLAT → formState → FLAT produces identical range keys", () => {
    const originalFlat = {
      "root/glucose|magnitude": 5.4,
      "root/glucose|unit": "mmol/L",
      "root/glucose/_normal_range/lower|magnitude": 3.9,
      "root/glucose/_normal_range/lower|unit": "mmol/L",
      "root/glucose/_normal_range/upper|magnitude": 6.1,
      "root/glucose/_normal_range/upper|unit": "mmol/L",
      "root/glucose/_normal_range/lower_unbounded": false,
      "root/glucose/_normal_range/upper_unbounded": false,
      "root/glucose/_normal_range/lower_included": true,
      "root/glucose/_normal_range/upper_included": true,
    };

    const formState = flatToFormState(quantityTemplate, originalFlat);
    const reEmitted = formStateToFlat(quantityTemplate, formState);

    // All original FLAT keys must be re-emitted with the same values.
    for (const [k, v] of Object.entries(originalFlat)) {
      expect(reEmitted[k]).toBe(v);
    }
  });
});

describe("normal_range — structuredToFormState read-back", () => {
  it("recovers _normal_range from STRUCTURED composite leaf object (DV_QUANTITY)", () => {
    const structured = {
      root: {
        glucose: [
          {
            "|magnitude": 5.4,
            "|unit": "mmol/L",
            "_normal_range|lower|magnitude": 3.9,
            "_normal_range|lower|unit": "mmol/L",
            "_normal_range|upper|magnitude": 6.1,
            "_normal_range|upper|unit": "mmol/L",
            "_normal_range|lower_unbounded": false,
            "_normal_range|upper_unbounded": false,
            "_normal_range|lower_included": true,
            "_normal_range|upper_included": true,
          },
        ],
      },
    };
    const formState = structuredToFormState(quantityTemplate, structured);
    const glucose = formState["glucose"] as Record<string, unknown>;

    expect(glucose["magnitude"]).toBe(5.4);
    expect(glucose["unit"]).toBe("mmol/L");

    const range = glucose["_normal_range"] as Record<string, unknown>;
    expect(range).toBeDefined();
    expect((range["lower"] as Record<string, unknown>)["magnitude"]).toBe(3.9);
    expect((range["upper"] as Record<string, unknown>)["magnitude"]).toBe(6.1);
    expect(range["lower_unbounded"]).toBe(false);
    expect(range["upper_unbounded"]).toBe(false);
  });
});
