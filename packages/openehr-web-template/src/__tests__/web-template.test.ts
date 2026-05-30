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
