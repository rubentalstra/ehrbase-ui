import { describe, expect, it } from "vitest";
import { WebTemplate } from "@ehrbase-ui/openehr-web-template";

import vitalsFixture from "./fixtures/vitalsigns.flat.json";
import {
  buildFlatPath,
  flatToFormState,
  formStateToFlat,
  parseFlatPath,
  SPEC_COMPONENT,
  SPEC_VERSION,
} from "../index.ts";

describe("spec coordinates", () => {
  it("identifies the FLAT / simSDT shape", () => {
    expect(SPEC_COMPONENT).toBe("FLAT");
    expect(SPEC_VERSION).toBe("ehrbase-2.31");
  });
});

describe("FLAT path grammar", () => {
  it("parses segments, indices, and the leaf attribute", () => {
    const parsed = parseFlatPath("vitals/blood_pressure:0/any_event:1/systolic|magnitude");
    expect(parsed.segments).toEqual([
      { id: "vitals" },
      { id: "blood_pressure", index: 0 },
      { id: "any_event", index: 1 },
      { id: "systolic" },
    ]);
    expect(parsed.attribute).toBe("magnitude");
  });

  it("treats a bare key (no |) as attribute-less", () => {
    expect(parseFlatPath("vitals/context/start_time").attribute).toBeUndefined();
  });

  it("round-trips every key of the real openEHR_SDK Vitalsigns FLAT fixture", () => {
    const keys = Object.keys(vitalsFixture);
    expect(keys.length).toBeGreaterThan(10);
    for (const key of keys) {
      const parsed = parseFlatPath(key);
      expect(buildFlatPath(parsed.segments, parsed.attribute)).toBe(key);
    }
  });
});

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

describe("formStateToFlat", () => {
  const formState = {
    weight: { magnitude: 70.5, unit: "kg" },
    note: "patient stable",
    observed: "2021-03-21T20:19:49",
    tags: ["a", "b"],
    category: { code: "433" },
  };
  const flat = formStateToFlat(template, formState);

  it("emits composite leaves with one |suffix per attribute", () => {
    expect(flat["vitals/weight|magnitude"]).toBe(70.5);
    expect(flat["vitals/weight|unit"]).toBe("kg");
    expect(flat["vitals/category|code"]).toBe("433");
  });

  it("emits scalar leaves with the rmType's FLAT suffix; date/time is bare", () => {
    expect(flat["vitals/note|value"]).toBe("patient stable");
    expect(flat["vitals/observed"]).toBe("2021-03-21T20:19:49"); // DV_DATE_TIME → bare key
  });

  it("emits :index for multiply-occurring nodes", () => {
    expect(flat["vitals/tags:0|value"]).toBe("a");
    expect(flat["vitals/tags:1|value"]).toBe("b");
  });
});

describe("flatToFormState (round-trip)", () => {
  it("is the inverse of formStateToFlat for the common leaf types + arrays", () => {
    const formState = {
      weight: { magnitude: 70.5, unit: "kg" },
      note: "patient stable",
      observed: "2021-03-21T20:19:49",
      tags: ["a", "b"],
      category: { code: "433" },
    };
    const flat = formStateToFlat(template, formState);
    expect(flatToFormState(template, flat)).toEqual(formState);
  });
});
