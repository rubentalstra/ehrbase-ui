import { describe, expect, it } from "vitest";

import fixture from "./fixtures/test_all_types.webtemplate.json";
import { generateFormSchema } from "../generate-form-schema.ts";
import { parseWebTemplate, SPEC_COMPONENT, SPEC_VERSION, WebTemplate } from "../index.ts";

// Helper: build + parse a minimal web template wrapping a single leaf/child node.
function template(child: unknown) {
  return parseWebTemplate({
    templateId: "unit.test.v1",
    defaultLanguage: "en",
    languages: ["en"],
    tree: { id: "root", rmType: "COMPOSITION", min: 1, max: 1, children: [child] },
  });
}

describe("spec coordinates", () => {
  it("identifies the EHRbase web template shape", () => {
    expect(SPEC_COMPONENT).toBe("WEB_TEMPLATE");
    expect(SPEC_VERSION).toBe("ehrbase-2.31");
  });
});

describe("parseWebTemplate (real openEHR_SDK fixture)", () => {
  it("parses the test_all_types web template", () => {
    const wt = parseWebTemplate(fixture);
    expect(wt.templateId).toBe("test_all_types.en.v1");
    expect(wt.languages).toContain("en");
    expect(wt.tree.rmType).toBe("COMPOSITION");
    expect(Array.isArray(wt.tree.children)).toBe(true);
  });

  it("rejects a document missing the required tree", () => {
    expect(WebTemplate.safeParse({ templateId: "x" }).success).toBe(false);
  });

  it("generates a form schema from the real template without throwing", () => {
    const schema = generateFormSchema(parseWebTemplate(fixture));
    expect(typeof schema.safeParse).toBe("function");
  });
});

describe("generateFormSchema — leaf mappings", () => {
  it("DV_QUANTITY → { magnitude: number, unit: enum }", () => {
    const schema = generateFormSchema(
      template({
        id: "weight",
        rmType: "DV_QUANTITY",
        min: 0,
        max: 1,
        inputs: [
          { suffix: "magnitude", type: "DECIMAL" },
          { suffix: "unit", type: "CODED_TEXT", list: [{ value: "kg" }, { value: "g" }] },
        ],
      }),
    );
    expect(schema.safeParse({ weight: { magnitude: 70.5, unit: "kg" } }).success).toBe(true);
    expect(schema.safeParse({ weight: { magnitude: "heavy", unit: "kg" } }).success).toBe(false);
    expect(schema.safeParse({ weight: { magnitude: 70, unit: "lb" } }).success).toBe(false); // unit not in list
    expect(schema.safeParse({}).success).toBe(true); // weight is optional (min 0)
  });

  it("DV_COUNT INTEGER with a >= range, required (min 1)", () => {
    const schema = generateFormSchema(
      template({
        id: "count",
        rmType: "DV_COUNT",
        min: 1,
        max: 1,
        inputs: [{ type: "INTEGER", validation: { range: { min: 0, minOp: ">=" } } }],
      }),
    );
    expect(schema.safeParse({ count: 3 }).success).toBe(true);
    expect(schema.safeParse({ count: -1 }).success).toBe(false); // below range
    expect(schema.safeParse({ count: 2.5 }).success).toBe(false); // not integer
    expect(schema.safeParse({}).success).toBe(false); // required
  });

  it("DV_CODED_TEXT closed list → enum", () => {
    const schema = generateFormSchema(
      template({
        id: "category",
        rmType: "DV_CODED_TEXT",
        min: 1,
        max: 1,
        inputs: [
          { suffix: "code", type: "CODED_TEXT", list: [{ value: "433" }, { value: "434" }], terminology: "openehr" },
        ],
      }),
    );
    // composite leaf keyed by suffix
    expect(schema.safeParse({ category: { code: "433" } }).success).toBe(true);
    expect(schema.safeParse({ category: { code: "999" } }).success).toBe(false);
  });

  // ── DV_ORDINAL ──────────────────────────────────────────────────────────────

  it("DV_ORDINAL closed list → scalar enum string", () => {
    const schema = generateFormSchema(
      template({
        id: "ordinal",
        rmType: "DV_ORDINAL",
        min: 0,
        max: 1,
        inputs: [
          {
            type: "CODED_TEXT",
            list: [
              { value: "at0014", label: "ord1", ordinal: 0 },
              { value: "at0015", label: "ord2", ordinal: 1 },
              { value: "at0016", label: "ord3", ordinal: 2 },
            ],
          },
        ],
      }),
    );
    // form-state for DV_ORDINAL is a scalar code string
    expect(schema.safeParse({ ordinal: "at0014" }).success).toBe(true);
    expect(schema.safeParse({ ordinal: "at0015" }).success).toBe(true);
    expect(schema.safeParse({ ordinal: "unknown_code" }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(true); // optional
  });

  it("DV_ORDINAL open list → scalar string (any value)", () => {
    const schema = generateFormSchema(
      template({
        id: "ordinal_open",
        rmType: "DV_ORDINAL",
        min: 0,
        max: 1,
        inputs: [{ type: "CODED_TEXT", listOpen: true, list: [{ value: "at0001", ordinal: 0 }] }],
      }),
    );
    expect(schema.safeParse({ ordinal_open: "any_code" }).success).toBe(true);
  });

  // ── DV_PROPORTION ──────────────────────────────────────────────────────────

  it("DV_PROPORTION → { numerator: number, denominator: number }", () => {
    const schema = generateFormSchema(
      template({
        id: "proportion",
        rmType: "DV_PROPORTION",
        min: 0,
        max: 1,
        inputs: [
          { suffix: "numerator", type: "DECIMAL" },
          { suffix: "denominator", type: "DECIMAL" },
        ],
      }),
    );
    expect(schema.safeParse({ proportion: { numerator: 3, denominator: 4 } }).success).toBe(true);
    expect(schema.safeParse({ proportion: { numerator: "x", denominator: 4 } }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(true); // optional
  });

  // ── DV_MULTIMEDIA ──────────────────────────────────────────────────────────

  it("DV_MULTIMEDIA → { name: string, size: number, type: string }", () => {
    const schema = generateFormSchema(
      template({
        id: "attachment",
        rmType: "DV_MULTIMEDIA",
        min: 0,
        max: 1,
        inputs: [{ type: "TEXT" }],
      }),
    );
    expect(schema.safeParse({ attachment: { name: "report.pdf", size: 12345, type: "application/pdf" } }).success).toBe(true);
    expect(schema.safeParse({ attachment: { name: "f", size: "big", type: "image/png" } }).success).toBe(false); // size not number
    expect(schema.safeParse({ attachment: {} }).success).toBe(false); // missing required keys
    expect(schema.safeParse({}).success).toBe(true); // optional
  });

  // ── DV_PARSABLE ────────────────────────────────────────────────────────────

  it("DV_PARSABLE → { value: string, formalism: string }", () => {
    const schema = generateFormSchema(
      template({
        id: "timing",
        rmType: "DV_PARSABLE",
        min: 0,
        max: 1,
        inputs: [
          { suffix: "value", type: "TEXT" },
          { suffix: "formalism", type: "TEXT" },
        ],
      }),
    );
    expect(schema.safeParse({ timing: { value: "R3/2021-01-01/P1D", formalism: "ISO8601" } }).success).toBe(true);
    expect(schema.safeParse({ timing: { value: 42, formalism: "ISO8601" } }).success).toBe(false); // value not string
    expect(schema.safeParse({}).success).toBe(true); // optional
  });

  // ── DV_IDENTIFIER ──────────────────────────────────────────────────────────

  it("DV_IDENTIFIER → { id, type, issuer, assigner } with suffix inputs", () => {
    const schema = generateFormSchema(
      template({
        id: "identifier",
        rmType: "DV_IDENTIFIER",
        min: 0,
        max: 1,
        inputs: [
          { suffix: "id", type: "TEXT" },
          { suffix: "type", type: "TEXT" },
          { suffix: "issuer", type: "TEXT" },
          { suffix: "assigner", type: "TEXT" },
        ],
      }),
    );
    expect(schema.safeParse({ identifier: { id: "PAT-001", type: "MRN", issuer: "Hospital", assigner: "Dept" } }).success).toBe(true);
    expect(schema.safeParse({ identifier: { id: 123 } }).success).toBe(false); // id not string
    expect(schema.safeParse({}).success).toBe(true); // optional
  });

  // ── DV_DURATION ────────────────────────────────────────────────────────────

  it("DV_DURATION → scalar ISO 8601 string (bare FLAT key)", () => {
    const schema = generateFormSchema(
      template({
        id: "duration_any",
        rmType: "DV_DURATION",
        min: 0,
        max: 1,
        // Template has composite inputs but renderer produces a scalar ISO string.
        inputs: [
          { suffix: "year", type: "INTEGER", validation: { range: { min: 0, minOp: ">=" } } },
          { suffix: "month", type: "INTEGER", validation: { range: { min: 0, minOp: ">=" } } },
          { suffix: "day", type: "INTEGER", validation: { range: { min: 0, minOp: ">=" } } },
        ],
      }),
    );
    // Form-state is a scalar ISO 8601 duration string (renderer output shape).
    expect(schema.safeParse({ duration_any: "P1Y2M3D" }).success).toBe(true);
    expect(schema.safeParse({ duration_any: "" }).success).toBe(true); // empty string is valid z.string()
    expect(schema.safeParse({ duration_any: 123 }).success).toBe(false); // not a string
    expect(schema.safeParse({}).success).toBe(true); // optional
  });

  // ── DV_INTERVAL (handled as container) ────────────────────────────────────

  it("DV_INTERVAL<DV_COUNT> → container with upper/lower children (no inputs needed)", () => {
    const schema = generateFormSchema(
      template({
        id: "interval_count",
        rmType: "DV_INTERVAL<DV_COUNT>",
        min: 0,
        max: 1,
        // No inputs — interval is a container with children
        children: [
          { id: "upper", rmType: "DV_COUNT", min: 1, max: 1, inputs: [{ type: "INTEGER" }] },
          { id: "lower", rmType: "DV_COUNT", min: 1, max: 1, inputs: [{ type: "INTEGER" }] },
        ],
      }),
    );
    expect(schema.safeParse({ interval_count: { upper: 10, lower: 5 } }).success).toBe(true);
    expect(schema.safeParse({ interval_count: { upper: "x", lower: 5 } }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(true); // optional
  });

  // ── Unmapped rmType fail-fast ──────────────────────────────────────────────

  it("unmapped rmType produces z.never() — safeParse always fails", () => {
    const schema = generateFormSchema(
      template({
        id: "exotic",
        rmType: "DV_SCALE", // not in the mapping table
        min: 0,
        max: 1,
        inputs: [{ type: "TEXT" }],
      }),
    );
    // The unsupported field is z.never() optional — any value provided fails.
    expect(schema.safeParse({ exotic: "anything" }).success).toBe(false);
    expect(schema.safeParse({ exotic: 123 }).success).toBe(false);
    // No exotic key → passes (field is optional, and undefined is fine for z.never().optional())
    expect(schema.safeParse({}).success).toBe(true);
  });
});

describe("generateFormSchema — cardinality", () => {
  it("max -1 with min 1 → non-empty array", () => {
    const schema = generateFormSchema(
      template({ id: "tags", rmType: "DV_TEXT", min: 1, max: -1, inputs: [{ type: "TEXT" }] }),
    );
    expect(schema.safeParse({ tags: ["a", "b"] }).success).toBe(true);
    expect(schema.safeParse({ tags: [] }).success).toBe(false); // min 1
    expect(schema.safeParse({ tags: "a" }).success).toBe(false); // must be array
  });
});
