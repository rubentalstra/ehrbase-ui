// Round-trip tests for the STRUCTURED (canonicalSDT) converter.
//
// Strategy:
//   1. Derive a minimal STRUCTURED document from the same vitals template used
//      in flat.test.ts (no external fixture required — we own the template shape).
//   2. structuredToFormState → compare to the expected form-state.
//   3. Verify the resulting form-state round-trips through flatToFormState via
//      formStateToFlat (transitively validates the converter output is usable by
//      the FLAT pipeline).
//   4. Verify the output passes generateFormSchema(template).safeParse.
//
// formStateToStructured is NOT tested here because it is not implemented in
// this release (deferred — see structured.ts file header).

import { describe, expect, it } from "vitest";
import { WebTemplate } from "@ehrbase-ui/openehr-web-template";
import { generateFormSchema } from "@ehrbase-ui/openehr-web-template";

import {
  structuredToFormState,
  flatToFormState,
  formStateToFlat,
} from "../index.ts";

// ── Shared test template (same shape as flat.test.ts) ────────────────────────

const template = WebTemplate.parse({
  templateId: "vitals.v1",
  defaultLanguage: "en",
  languages: ["en"],
  tree: {
    id: "vitals",
    rmType: "COMPOSITION",
    min: 1,
    max: 1,
    children: [
      {
        id: "weight",
        rmType: "DV_QUANTITY",
        min: 0,
        max: 1,
        inputs: [
          { suffix: "magnitude", type: "DECIMAL" },
          { suffix: "unit", type: "CODED_TEXT" },
        ],
      },
      { id: "note", rmType: "DV_TEXT", min: 0, max: 1, inputs: [{ type: "TEXT" }] },
      { id: "observed", rmType: "DV_DATE_TIME", min: 0, max: 1, inputs: [{ type: "DATETIME" }] },
      { id: "tags", rmType: "DV_TEXT", min: 0, max: -1, inputs: [{ type: "TEXT" }] },
      {
        id: "category",
        rmType: "DV_CODED_TEXT",
        min: 0,
        max: 1,
        inputs: [{ suffix: "code", type: "CODED_TEXT" }],
      },
    ],
  },
});

// ── Expected form-state (ground truth) ──────────────────────────────────────

const expectedFormState = {
  weight: { magnitude: 70.5, unit: "kg" },
  note: "patient stable",
  observed: "2021-03-21T20:19:49",
  tags: ["a", "b"],
  category: { code: "433" },
};

// ── Minimal STRUCTURED document matching expectedFormState ───────────────────
//
// EHRbase canonicalSDT shape:
//   { "<root-id>": { "<child-id>": [ { "|suffix": value, … } ] } }
// Scalar leaves use "|value" as the single attribute key.
// Array leaves: one element per occurrence.

const structuredDoc = {
  vitals: {
    weight: [{ "|magnitude": 70.5, "|unit": "kg" }],
    note: [{ "|value": "patient stable" }],
    observed: [{ "|value": "2021-03-21T20:19:49" }],
    tags: [{ "|value": "a" }, { "|value": "b" }],
    category: [{ "|code": "433" }],
  },
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("structuredToFormState", () => {
  const formState = structuredToFormState(template, structuredDoc);

  it("extracts composite leaf (DV_QUANTITY) correctly", () => {
    expect(formState["weight"]).toEqual({ magnitude: 70.5, unit: "kg" });
  });

  it("extracts scalar text leaf (DV_TEXT) correctly", () => {
    expect(formState["note"]).toBe("patient stable");
  });

  it("extracts bare-key leaf (DV_DATE_TIME) correctly", () => {
    expect(formState["observed"]).toBe("2021-03-21T20:19:49");
  });

  it("extracts multiply-occurring leaf (DV_TEXT array) correctly", () => {
    expect(formState["tags"]).toEqual(["a", "b"]);
  });

  it("extracts coded-text composite leaf (DV_CODED_TEXT) correctly", () => {
    expect(formState["category"]).toEqual({ code: "433" });
  });

  it("matches the expected form-state exactly", () => {
    expect(formState).toEqual(expectedFormState);
  });
});

describe("structuredToFormState → FLAT round-trip", () => {
  it("structuredToFormState output is usable by formStateToFlat / flatToFormState", () => {
    const formState = structuredToFormState(template, structuredDoc);
    const flat = formStateToFlat(template, formState);
    const roundTripped = flatToFormState(template, flat);
    expect(roundTripped).toEqual(expectedFormState);
  });
});

describe("structuredToFormState output passes generateFormSchema", () => {
  it("validates the form-state with the template-derived Zod schema", () => {
    const formState = structuredToFormState(template, structuredDoc);
    const schema = generateFormSchema(template);
    const result = schema.safeParse(formState);
    expect(result.success).toBe(true);
  });
});

describe("structuredToFormState edge cases", () => {
  it("returns empty object for an empty document", () => {
    expect(structuredToFormState(template, {})).toEqual({});
  });

  it("returns empty object for null input", () => {
    expect(structuredToFormState(template, null)).toEqual({});
  });

  it("returns empty object for non-object input", () => {
    expect(structuredToFormState(template, "not an object")).toEqual({});
  });

  it("ignores unknown node ids in the document gracefully", () => {
    const doc = {
      vitals: {
        weight: [{ "|magnitude": 72, "|unit": "kg" }],
        unknown_field: [{ "|value": "ignored" }],
      },
    };
    const formState = structuredToFormState(template, doc);
    expect(formState["weight"]).toEqual({ magnitude: 72, unit: "kg" });
    // unknown_field has no matching child in the template — not present in form state.
    expect(Object.prototype.hasOwnProperty.call(formState, "unknown_field")).toBe(false);
  });

  it("handles a document keyed by templateId rather than tree id", () => {
    const docByTemplateId = {
      "vitals.v1": {
        note: [{ "|value": "alt key" }],
      },
    };
    const formState = structuredToFormState(template, docByTemplateId);
    expect(formState["note"]).toBe("alt key");
  });

  it("handles a document where the root value is a 1-element array (composition wrapper)", () => {
    const docWrapped = {
      vitals: [
        {
          note: [{ "|value": "wrapped" }],
        },
      ],
    };
    const formState = structuredToFormState(template, docWrapped);
    expect(formState["note"]).toBe("wrapped");
  });
});
