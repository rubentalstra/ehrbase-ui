// Snowstorm adapter — runs the shared TerminologyProvider contract suite against
// the in-memory FHIR terminology double, plus Snowstorm-specific posture checks:
// supportsSnomedEcl=true and the `_displayLanguage` expansion parameter is sent
// (ADR-0022, ADR-0034). The live Snowstorm server (docker-compose `terminology`
// profile) is the belt-and-braces integration check; tests use the double.

import { type FetchLike } from "@ehrbase-ui/term-core";
import {
  runTerminologyContractSuite,
  type TerminologyContractHarness,
} from "@ehrbase-ui/term-core/contract";
import {
  createInMemoryFhirTerminologyServer,
  SAMPLE_VALUESET_URL,
} from "@ehrbase-ui/term-core/fhir-double";
import { describe, expect, it, vi } from "vitest";

import { SnowstormTerminologyProvider } from "../index.ts";

function setup(): Promise<TerminologyContractHarness> {
  const server = createInMemoryFhirTerminologyServer();
  const provider = new SnowstormTerminologyProvider({
    baseUrl: "http://snowstorm.test/fhir",
    fetch: server.fetch,
    defaultDisplayLanguage: "en",
  });
  return Promise.resolve({ provider });
}

runTerminologyContractSuite("Snowstorm adapter (in-memory double)", setup);

describe("Snowstorm adapter — posture", () => {
  it("advertises SNOMED-ECL support", async () => {
    const { provider } = await setup();
    expect(provider.capabilities.supportsSnomedEcl).toBe(true);
    expect(provider.name).toBe("snowstorm");
  });

  it("sends `_displayLanguage` on $expand", async () => {
    const server = createInMemoryFhirTerminologyServer();
    const seen: string[] = [];
    const spyFetch: FetchLike = (input, init) => {
      seen.push(input);
      return server.fetch(input, init);
    };
    const provider = new SnowstormTerminologyProvider({
      baseUrl: "http://snowstorm.test/fhir",
      fetch: spyFetch,
      defaultDisplayLanguage: "nl",
    });
    await provider.expandValueSet({ url: SAMPLE_VALUESET_URL, count: 20, offset: 0 });
    const expandCall = seen.find((u) => u.includes("/ValueSet/$expand"));
    expect(expandCall).toBeDefined();
    expect(expandCall).toContain("_displayLanguage=nl");
  });

  it("honours a per-call display language over the default", async () => {
    const server = createInMemoryFhirTerminologyServer();
    const seen: string[] = [];
    const spyFetch: FetchLike = (input, init) => {
      seen.push(input);
      return server.fetch(input, init);
    };
    const provider = new SnowstormTerminologyProvider({
      baseUrl: "http://snowstorm.test/fhir",
      fetch: spyFetch,
      defaultDisplayLanguage: "en",
    });
    await provider.expandValueSet({
      url: SAMPLE_VALUESET_URL,
      displayLanguage: "de",
      count: 20,
      offset: 0,
    });
    expect(seen.find((u) => u.includes("_displayLanguage=de"))).toBeDefined();
    vi.clearAllMocks();
  });
});
