// Generic-FHIR adapter — runs the shared TerminologyProvider contract suite
// against the in-memory FHIR terminology double, plus version posture: R5/R6
// throw at construction, supportsSnomedEcl=false (ADR-0033 shape, ADR-0034).
// The live HAPI/Ontoserver server (docker-compose `terminology` profile) is the
// belt-and-braces integration check; tests use the double.

import {
  runTerminologyContractSuite,
  type TerminologyContractHarness,
} from "@ehrbase-ui/term-core/contract";
import { createInMemoryFhirTerminologyServer } from "@ehrbase-ui/term-core/fhir-double";
import { describe, expect, it } from "vitest";

import { GenericFhirTerminologyProvider } from "../index.ts";

function setup(): Promise<TerminologyContractHarness> {
  const server = createInMemoryFhirTerminologyServer();
  const provider = new GenericFhirTerminologyProvider({
    baseUrl: "http://hapi.test/fhir",
    fhirVersion: "R4",
    fetch: server.fetch,
  });
  return Promise.resolve({ provider });
}

runTerminologyContractSuite("Generic FHIR R4 adapter (in-memory double)", setup);

describe("Generic FHIR adapter — posture", () => {
  it("throws at construction for R5 (not implemented in v1.0)", () => {
    expect(
      () =>
        new GenericFhirTerminologyProvider({
          baseUrl: "http://hapi.test/fhir",
          fhirVersion: "R5",
        }),
    ).toThrow(/R5 terminology mapper not implemented/u);
  });

  it("accepts R4B and does NOT assume SNOMED-ECL", () => {
    const provider = new GenericFhirTerminologyProvider({
      baseUrl: "http://hapi.test/fhir",
      fhirVersion: "R4B",
    });
    expect(provider.capabilities.supportsSnomedEcl).toBe(false);
    expect(provider.capabilities.supportsExpand).toBe(true);
    expect(provider.name).toBe("generic-fhir");
  });
});
