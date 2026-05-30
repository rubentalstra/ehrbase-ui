import { describe, expect, it } from "vitest";

import { COMPOSITION } from "../index.ts";

// ADR-0016 catalogue round-trip gate: real canonical compositions from the
// openEHR_SDK test data (Apache-2.0) must parse against the generated RM
// COMPOSITION schema and re-parse idempotently. Each fixture exercises a
// different archetype family (encounter / report / minimal / persistent;
// OBSERVATION / EVALUATION / INSTRUCTION / ADMIN_ENTRY entries; vitals + labs).
import compoCorona from "./fixtures/canonical/compo_corona.json";
import compoNestedPartyIdentified from "./fixtures/canonical/compo_with_nested_party_identified.json";
import demoVitals from "./fixtures/canonical/demo_vitals_352.json";
import ipsCanonical from "./fixtures/canonical/ips_canonical.json";
import laboratoryReport from "./fixtures/canonical/laboratory_report.json";
import minimalAdmin from "./fixtures/canonical/minimal_admin.json";
import minimalEvaluation from "./fixtures/canonical/minimal_evaluation.json";
import minimalInstruction from "./fixtures/canonical/minimal_instruction.json";
import minimalObservation from "./fixtures/canonical/minimal_observation.json";
import minimalPersistent from "./fixtures/canonical/minimal_persistent.json";

const FIXTURES: ReadonlyArray<readonly [string, unknown]> = [
  ["minimal_observation", minimalObservation],
  ["minimal_evaluation", minimalEvaluation],
  ["minimal_instruction", minimalInstruction],
  ["minimal_admin", minimalAdmin],
  ["minimal_persistent", minimalPersistent],
  ["demo_vitals_352", demoVitals],
  ["laboratory_report", laboratoryReport],
  ["ips_canonical", ipsCanonical],
  ["compo_with_nested_party_identified", compoNestedPartyIdentified],
  ["compo_corona", compoCorona],
];

describe("ADR-0016 canonical composition round-trip", () => {
  for (const [name, fixture] of FIXTURES) {
    it(`${name} parses against the RM COMPOSITION schema`, () => {
      const parsed = COMPOSITION.safeParse(fixture);
      expect(parsed.success, parsed.success ? "ok" : JSON.stringify(parsed.error?.issues?.slice(0, 6))).toBe(
        true,
      );
    });

    it(`${name} re-parses idempotently`, () => {
      const first = COMPOSITION.safeParse(fixture);
      if (first.success) {
        expect(COMPOSITION.safeParse(first.data).success).toBe(true);
      }
    });
  }

  // Known divergence (follow-up): the openEHR_SDK `all_types_no_multimedia`
  // fixture omits DV_INTERVAL.lower_included / upper_included, which the
  // ITS-JSON schema marks REQUIRED — a spec-strictness-vs-CDR-practice gap, not
  // a generator bug. Needs a lenient-parse path (facade override / generator
  // option to relax DV_INTERVAL boundary flags) before it can join the gate.
  it.todo("all_types_no_multimedia — DV_INTERVAL lower_included/upper_included strictness divergence");
});
