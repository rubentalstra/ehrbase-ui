import { describe, expect, it } from "vitest";

import { CdsCondition, CdsRule, CdsSeverity, SPEC_COMPONENT, SPEC_VERSION } from "../index.ts";

describe("spec coordinates", () => {
  it("pins CDS 2.0.1 (GDL2)", () => {
    expect(SPEC_COMPONENT).toBe("CDS");
    expect(SPEC_VERSION).toBe("2.0.1");
  });
});

// cds_001-style drug-allergy rule.
const drugAllergyRule = {
  id: "cds_001",
  name: "Drug–allergy interaction",
  status: "active",
  gdlVersion: "GDL2",
  bindings: [
    { id: "orderedDrug", path: "/items[at0001]/value", archetypeId: "openEHR-EHR-INSTRUCTION.medication_order.v3" },
    { id: "allergies", path: "/items[at0002]/value", archetypeId: "openEHR-EHR-EVALUATION.adverse_reaction_risk.v2" },
  ],
  when: {
    kind: "and",
    operands: [
      { kind: "compare", variable: "orderedDrug", op: "in", value: ["penicillin", "amoxicillin"] },
      { kind: "compare", variable: "allergies", op: "exists" },
    ],
  },
  then: [{ kind: "alert", severity: "critical", message: "Patient has a recorded allergy to this drug class." }],
};

describe("CdsRule", () => {
  it("parses a severity-graded rule with a nested condition tree", () => {
    const parsed = CdsRule.safeParse(drugAllergyRule);
    expect(parsed.success, parsed.success ? "ok" : JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("requires at least one action and a valid severity", () => {
    expect(CdsRule.safeParse({ ...drugAllergyRule, then: [] }).success).toBe(false);
    expect(CdsSeverity.safeParse("blocker").success).toBe(false);
    expect(CdsSeverity.options).toEqual(["info", "warning", "critical"]);
  });

  it("CdsCondition accepts comparison / and / or / not (recursive)", () => {
    expect(
      CdsCondition.safeParse({
        kind: "not",
        operand: { kind: "or", operands: [{ kind: "compare", variable: "x", op: ">", value: 5 }] },
      }).success,
    ).toBe(true);
  });
});
