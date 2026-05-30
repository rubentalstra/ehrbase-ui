// FHIR R4 adapter — runs the shared DemographicProvider contract suite against
// an in-memory FHIR Patient double (writes enabled), plus FHIR-specific posture
// checks: R5/R6 throw at construction, and the default read-only mode gates
// mutations (ADR-0031, ADR-0033).

import {
  RecordingAuditSink,
  runDemographicContractSuite,
  sampleParty,
  TEST_CTX,
  type ContractHarness,
} from "@ehrbase-ui/demographic-core/contract";
import { CapabilityError } from "@ehrbase-ui/demographic-core";
import { describe, expect, it } from "vitest";

import { FhirDemographicProvider } from "../provider.ts";
import { createInMemoryFhirServer } from "../fhir-double.ts";

const testPseudonymize = (value: string): string => `h:${Buffer.from(value).toString("hex")}`;

function setup(): Promise<ContractHarness> {
  const server = createInMemoryFhirServer();
  const audit = new RecordingAuditSink();
  const provider = new FhirDemographicProvider({
    baseUrl: "http://fhir.test/fhir",
    fhirVersion: "R4",
    audit,
    pseudonymize: testPseudonymize,
    allowWrites: true,
    fetch: server.fetch,
  });
  return Promise.resolve({ provider, audit });
}

runDemographicContractSuite("FHIR R4 adapter (writes enabled)", setup, {
  supportsHistory: true,
  enforcesUniqueIdentifier: false,
  supportsRelationships: true,
  supportsMerge: true,
});

describe("FHIR R4 adapter — posture", () => {
  it("throws at construction for R5 (not implemented in v1.0)", () => {
    expect(
      () =>
        new FhirDemographicProvider({
          baseUrl: "http://fhir.test/fhir",
          fhirVersion: "R5",
          audit: new RecordingAuditSink(),
          pseudonymize: testPseudonymize,
        }),
    ).toThrow(/R5 mapper not implemented/u);
  });

  it("is read-only by default — every mutation is capability-gated", async () => {
    const server = createInMemoryFhirServer();
    const provider = new FhirDemographicProvider({
      baseUrl: "http://fhir.test/fhir",
      fhirVersion: "R4",
      audit: new RecordingAuditSink(),
      pseudonymize: testPseudonymize,
      fetch: server.fetch,
    });
    expect(provider.capabilities.readonly).toBe(true);
    expect(provider.capabilities.supportsMerge).toBe(false);
    await expect(provider.createParty(sampleParty(), TEST_CTX)).rejects.toBeInstanceOf(CapabilityError);
    await expect(provider.mergeParty("a", "b", TEST_CTX)).rejects.toBeInstanceOf(CapabilityError);
    await expect(
      provider.addRelationship({ source: "a", target: "b", type: "next-of-kin" }, TEST_CTX),
    ).rejects.toBeInstanceOf(CapabilityError);
  });

  it("supports merge + relationships when writes are enabled", async () => {
    const { provider } = await setup();
    expect(provider.capabilities.supportsMerge).toBe(true);
    const a = await provider.createParty(sampleParty(), TEST_CTX);
    const b = await provider.createParty(
      sampleParty({ identifiers: [{ namespace: "mrn", value: "MRN-FHIR-REL" }] }),
      TEST_CTX,
    );
    const rel = await provider.addRelationship({ source: a.id, target: b.id, type: "next-of-kin" }, TEST_CTX);
    expect(rel.id).toBeTruthy();
    await provider.endRelationship(rel.id, TEST_CTX);
    await provider.mergeParty(a.id, b.id, TEST_CTX);
    expect((await provider.getParty(b.id, {}, TEST_CTX))?.active).toBe(false);
  });
});
