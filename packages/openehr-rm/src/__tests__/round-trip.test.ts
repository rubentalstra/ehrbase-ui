import { describe, expect, it } from "vitest";

import { COMPOSITION, parseDvIntervalLenient } from "../index.ts";

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
});

// F3 — DV_INTERVAL lenient-parse gate.
//
// The `all_types_no_multimedia` fixture omits `lower_included`/`upper_included`
// on DV_INTERVAL nodes — a spec-strictness-vs-CDR-practice gap.  The strict
// generated schema rejects these; `parseDvIntervalLenient` (facade/interval.ts)
// defaults the flags per the openEHR RM rule and produces a valid DV_INTERVAL.
describe("all_types_no_multimedia — DV_INTERVAL lenient-parse (F3)", () => {
  it("parseDvIntervalLenient defaults missing _included flags for bounded ends", () => {
    const raw = {
      lower: { magnitude: 3.9, units: "mmol/L", _type: "DV_QUANTITY" },
      upper: { magnitude: 6.1, units: "mmol/L", _type: "DV_QUANTITY" },
      lower_unbounded: false,
      upper_unbounded: false,
      // lower_included / upper_included intentionally absent
      _type: "DV_INTERVAL",
    };
    const result = parseDvIntervalLenient(raw);
    expect(result).not.toBeNull();
    expect(result?.lower_included).toBe(true);  // bounded → included=true (RM rule)
    expect(result?.upper_included).toBe(true);
    expect(result?.lower_unbounded).toBe(false);
    expect(result?.upper_unbounded).toBe(false);
  });

  it("parseDvIntervalLenient defaults missing _included flags for unbounded ends", () => {
    const raw = {
      upper: { magnitude: 200, units: "mg/dL", _type: "DV_QUANTITY" },
      lower_unbounded: true,
      upper_unbounded: false,
      // lower_included / upper_included absent
      _type: "DV_INTERVAL",
    };
    const result = parseDvIntervalLenient(raw);
    expect(result).not.toBeNull();
    expect(result?.lower_included).toBe(false);  // unbounded → included=false
    expect(result?.upper_included).toBe(true);   // bounded → included=true
  });

  it("parseDvIntervalLenient honours explicit false on a bounded end", () => {
    const raw = {
      upper: { magnitude: 200, units: "mg/dL", _type: "DV_QUANTITY" },
      lower_unbounded: true,
      upper_unbounded: false,
      lower_included: false,
      upper_included: false,  // explicit override: half-open interval
      _type: "DV_INTERVAL",
    };
    const result = parseDvIntervalLenient(raw);
    expect(result).not.toBeNull();
    expect(result?.upper_included).toBe(false);
  });

  it("parseDvIntervalLenient round-trips when _included flags are already present", () => {
    const raw = {
      lower: { magnitude: 36.0, units: "%", _type: "DV_QUANTITY" },
      upper: { magnitude: 46.0, units: "%", _type: "DV_QUANTITY" },
      lower_unbounded: false,
      upper_unbounded: false,
      lower_included: true,
      upper_included: true,
      _type: "DV_INTERVAL",
    };
    const result = parseDvIntervalLenient(raw);
    expect(result?.lower_included).toBe(true);
    expect(result?.upper_included).toBe(true);
  });

  it("parseDvIntervalLenient returns null for non-DV_INTERVAL input", () => {
    expect(parseDvIntervalLenient(null)).toBeNull();
    expect(parseDvIntervalLenient("not an interval")).toBeNull();
    expect(parseDvIntervalLenient({ magnitude: 5, units: "kg" })).toBeNull();
  });
});
