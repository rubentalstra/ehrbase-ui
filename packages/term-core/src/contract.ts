// Provider-contract suite (ADR-0034 verification) — parametrized over EVERY
// concrete TerminologyProvider so the Snowstorm adapter and the generic-FHIR
// adapter prove they honour the same interface against the same in-memory FHIR
// terminology double. Imported by each adapter's *.test.ts, which supplies a
// freshly-constructed provider. Mirrors demographic-core/contract.
//
// Capability-aware: expand/validate/lookup assertions run only where the adapter
// advertises them (Inviolable rule 13 — complete, not faked).

import { describe, expect, it } from "vitest";

import { SAMPLE_VALUESET_URL, SNOMED_SYSTEM } from "./fhir-double.ts";
import type { TerminologyProvider } from "./provider.ts";

export interface TerminologyContractHarness {
  provider: TerminologyProvider;
}

/** Register the contract suite. Call from an adapter's *.test.ts at top level. */
export function runTerminologyContractSuite(
  name: string,
  setup: () => Promise<TerminologyContractHarness>,
): void {
  describe(name, () => {
    it("advertises configured capabilities", async () => {
      const { provider } = await setup();
      expect(provider.capabilities.configured).toBe(true);
      expect(provider.name).toBeTruthy();
    });

    it("expands a value set with no filter (returns the whole binding)", async () => {
      const { provider } = await setup();
      if (!provider.capabilities.supportsExpand) return;
      const result = await provider.expandValueSet({
        url: SAMPLE_VALUESET_URL,
        count: 20,
        offset: 0,
      });
      expect(result.total).toBeGreaterThanOrEqual(3);
      expect(result.options.length).toBeGreaterThanOrEqual(3);
      // Every option is a usable CodedOption (system + code + display present).
      for (const o of result.options) {
        expect(o.system).toBeTruthy();
        expect(o.code).toBeTruthy();
        expect(o.display).toBeTruthy();
      }
    });

    it("filters an expansion by the autocomplete text", async () => {
      const { provider } = await setup();
      if (!provider.capabilities.supportsExpand) return;
      const result = await provider.expandValueSet({
        url: SAMPLE_VALUESET_URL,
        filter: "diabetes",
        count: 20,
        offset: 0,
      });
      expect(result.options.length).toBe(1);
      expect(result.options[0]?.code).toBe("73211009");
      expect(result.options[0]?.display).toMatch(/diabetes/iu);
    });

    it("pages an expansion (count + offset)", async () => {
      const { provider } = await setup();
      if (!provider.capabilities.supportsExpand) return;
      const first = await provider.expandValueSet({ url: SAMPLE_VALUESET_URL, count: 1, offset: 0 });
      const second = await provider.expandValueSet({ url: SAMPLE_VALUESET_URL, count: 1, offset: 1 });
      expect(first.options.length).toBe(1);
      expect(second.options.length).toBe(1);
      expect(first.options[0]?.code).not.toBe(second.options[0]?.code);
    });

    it("returns an empty expansion for an unknown value set (no throw)", async () => {
      const { provider } = await setup();
      if (!provider.capabilities.supportsExpand) return;
      const result = await provider.expandValueSet({
        url: "http://ehrbase-ui.test/fhir/ValueSet/does-not-exist",
        count: 20,
        offset: 0,
      });
      expect(result.options).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("looks up the display for a known code", async () => {
      const { provider } = await setup();
      if (!provider.capabilities.supportsLookup) return;
      const result = await provider.lookup({ system: SNOMED_SYSTEM, code: "38341003" });
      expect(result.display).toMatch(/hypertensive/iu);
    });

    it("returns designations from a lookup when present", async () => {
      const { provider } = await setup();
      if (!provider.capabilities.supportsLookup) return;
      const result = await provider.lookup({ system: SNOMED_SYSTEM, code: "38341003" });
      const nl = result.designations.find((d) => d.value === "Hypertensie");
      expect(nl).toBeDefined();
    });

    it("validates a code that is a value-set member", async () => {
      const { provider } = await setup();
      if (!provider.capabilities.supportsValidate) return;
      const valid = await provider.validateCode({
        valueSetUrl: SAMPLE_VALUESET_URL,
        code: "38341003",
      });
      expect(valid).toBe(true);
    });

    it("rejects a code that is NOT a value-set member", async () => {
      const { provider } = await setup();
      if (!provider.capabilities.supportsValidate) return;
      const valid = await provider.validateCode({
        valueSetUrl: SAMPLE_VALUESET_URL,
        code: "00000000",
      });
      expect(valid).toBe(false);
    });

    it("validates a code against its code system", async () => {
      const { provider } = await setup();
      if (!provider.capabilities.supportsValidate) return;
      const valid = await provider.validateCode({ system: SNOMED_SYSTEM, code: "73211009" });
      expect(valid).toBe(true);
    });
  });
}
