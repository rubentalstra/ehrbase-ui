// term-core tests: the shared FhirTerminologyProvider run through the contract
// suite against the in-memory FHIR terminology double, plus the `none` provider's
// graceful-degradation posture (configured:false → empty results, never throws).

import { describe, expect, it } from "vitest";

import { runTerminologyContractSuite, type TerminologyContractHarness } from "../contract.ts";
import { createInMemoryFhirTerminologyServer } from "../fhir-double.ts";
import { FhirTerminologyProvider } from "../fhir-provider.ts";
import { NoneTerminologyProvider } from "../none-provider.ts";

function setup(): Promise<TerminologyContractHarness> {
  const server = createInMemoryFhirTerminologyServer();
  const provider = new FhirTerminologyProvider({
    baseUrl: "http://tx.test/fhir",
    fetch: server.fetch,
    defaultDisplayLanguage: "en",
  });
  return Promise.resolve({ provider });
}

runTerminologyContractSuite("term-core FhirTerminologyProvider (in-memory double)", setup);

describe("NoneTerminologyProvider — graceful degradation", () => {
  it("advertises configured:false so the UI can degrade the picker", () => {
    const provider = new NoneTerminologyProvider();
    expect(provider.capabilities.configured).toBe(false);
    expect(provider.capabilities.supportsExpand).toBe(false);
  });

  it("returns an empty expansion (never throws)", async () => {
    const provider = new NoneTerminologyProvider();
    const result = await provider.expandValueSet({ url: "http://x/ValueSet/y", count: 20, offset: 0 });
    expect(result.options).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("echoes the code as its own display on lookup", async () => {
    const provider = new NoneTerminologyProvider();
    const result = await provider.lookup({ system: "http://snomed.info/sct", code: "1234" });
    expect(result.display).toBe("1234");
  });

  it("validates nothing (no server to confirm membership)", async () => {
    const provider = new NoneTerminologyProvider();
    expect(await provider.validateCode({ system: "http://snomed.info/sct", code: "1234" })).toBe(false);
  });
});
