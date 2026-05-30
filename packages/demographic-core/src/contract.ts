// Provider-contract suite (ADR-0031 verification) — parametrized over EVERY
// concrete DemographicProvider so the built-in Postgres adapter and the FHIR R4
// adapter prove they honour the same interface + audit obligations. Imported by
// each adapter's *.test.ts, which supplies a freshly-set-up provider.
//
// Capability-aware: mutation/history/merge/unique-identifier assertions run only
// where the adapter advertises them, so a read-only provider isn't held to a
// write contract (Inviolable rule 13 — complete, not faked).

import { describe, expect, it } from "vitest";

import type { AuditSink, PartyAuditEvent } from "./audit.ts";
import type { CreatePartyInput, DemographicProvider, ProviderContext } from "./provider.ts";

/** AuditSink test double — records every event so the suite can assert rule 1. */
export class RecordingAuditSink implements AuditSink {
  readonly events: PartyAuditEvent[] = [];
  record(event: PartyAuditEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
  clear(): void {
    this.events.length = 0;
  }
}

export const TEST_CTX: ProviderContext = {
  actor: { userId: "u-1", username: "dr.house", displayName: "Dr. House", roles: ["clinician"] },
  sessionId: "sess-1",
  correlationId: "corr-1",
};

// A valid NL BSN (passes the 11-proef) so identifier validation accepts it.
export const VALID_BSN = "111222333";

export function sampleParty(overrides: Partial<CreatePartyInput> = {}): CreatePartyInput {
  return {
    identifiers: [{ namespace: "nl-bsn", value: VALID_BSN }],
    names: [{ use: "official", family: "de Vries", given: ["Anna", "Maria"], prefix: [], suffix: [] }],
    gender: "female",
    birthDate: "1980-04-12",
    addresses: [{ use: "home", lines: ["Keizersgracht 1"], city: "Amsterdam", country: "NL" }],
    contacts: [{ system: "phone", value: "+31201234567" }],
    ...overrides,
  };
}

export interface ContractHarness {
  provider: DemographicProvider;
  audit: RecordingAuditSink;
  /** A second valid identifier value for duplicate/uniqueness tests. */
  secondBsn?: string;
}

export interface ContractOptions {
  /** The adapter reads a specific prior version (built-in history / FHIR _history). */
  supportsHistory: boolean;
  /** The store enforces one-active-party-per-identifier (built-in unique index). */
  enforcesUniqueIdentifier: boolean;
  /** The adapter supports PARTY_RELATIONSHIP. */
  supportsRelationships: boolean;
  /** The adapter supports party merge (built-in tombstone / FHIR Patient.link). */
  supportsMerge: boolean;
}

/** Register the contract suite. Call from an adapter's *.test.ts at top level. */
export function runDemographicContractSuite(
  name: string,
  setup: () => Promise<ContractHarness>,
  opts: ContractOptions,
): void {
  describe(name, () => {
    it("creates a party and returns a rule-12 PartyRef", async () => {
      const { provider, audit } = await setup();
      const ref = await provider.createParty(sampleParty(), TEST_CTX);
      expect(ref.type).toBe("PERSON");
      expect(ref.id).toBeTruthy();
      expect(ref.namespace).toBeTruthy();
      // rule 1: a CREATE audit event with a pseudonymised subject hash (no raw id).
      const created = audit.events.find((e) => e.action === "CREATE" && e.outcome === "SUCCESS");
      expect(created).toBeDefined();
      expect(created?.subjectIdHash).toBeTruthy();
      expect(created?.subjectIdHash).not.toContain(VALID_BSN);
    });

    it("round-trips a created party through getParty", async () => {
      const { provider } = await setup();
      const ref = await provider.createParty(sampleParty(), TEST_CTX);
      const got = await provider.getParty(ref.id, {}, TEST_CTX);
      expect(got).not.toBeNull();
      expect(got?.active).toBe(true);
      expect(got?.names[0]?.family).toBe("de Vries");
      expect(got?.identifiers[0]?.value).toBe(VALID_BSN);
      expect(got?.identifiers[0]?.id).toBeTruthy();
    });

    it("rejects a malformed identifier for a known namespace", async () => {
      const { provider } = await setup();
      await expect(
        provider.createParty(sampleParty({ identifiers: [{ namespace: "nl-bsn", value: "123" }] }), TEST_CTX),
      ).rejects.toThrow();
    });

    it("updates a party (patch semantics) and bumps the version", async () => {
      const { provider } = await setup();
      const ref = await provider.createParty(sampleParty(), TEST_CTX);
      const before = await provider.getParty(ref.id, {}, TEST_CTX);
      await provider.updateParty(ref.id, { gender: "other" }, TEST_CTX);
      const after = await provider.getParty(ref.id, {}, TEST_CTX);
      expect(after?.gender).toBe("other");
      // patch: untouched fields survive.
      expect(after?.names[0]?.family).toBe("de Vries");
      expect(after?.version).toBe((before?.version ?? 0) + 1);
    });

    if (opts.supportsHistory) {
      it("reads a prior version after an update", async () => {
        const { provider } = await setup();
        const ref = await provider.createParty(sampleParty(), TEST_CTX);
        await provider.updateParty(ref.id, { gender: "other" }, TEST_CTX);
        const v1 = await provider.getParty(ref.id, { version: 1 }, TEST_CTX);
        expect(v1?.gender).toBe("female");
        const versions = await provider.listVersions(ref.id, TEST_CTX);
        expect(versions.map((v) => v.version)).toContain(1);
        expect(versions.length).toBeGreaterThanOrEqual(2);
      });
    }

    it("finds a party by identifier and by family name", async () => {
      const { provider } = await setup();
      await provider.createParty(sampleParty(), TEST_CTX);
      const byId = await provider.searchParty(
        { identifier: { namespace: "nl-bsn", value: VALID_BSN }, limit: 20, offset: 0 },
        TEST_CTX,
      );
      expect(byId.total).toBeGreaterThanOrEqual(1);
      expect(byId.parties[0]?.identifiers[0]?.value).toBe(VALID_BSN);
      const byName = await provider.searchParty(
        { family: "de Vries", limit: 20, offset: 0 },
        TEST_CTX,
      );
      expect(byName.total).toBeGreaterThanOrEqual(1);
    });

    it("audits a search as QUERY without leaking the raw identifier", async () => {
      const { provider, audit } = await setup();
      await provider.createParty(sampleParty(), TEST_CTX);
      audit.clear();
      await provider.searchParty(
        { identifier: { namespace: "nl-bsn", value: VALID_BSN }, limit: 20, offset: 0 },
        TEST_CTX,
      );
      const q = audit.events.find((e) => e.action === "QUERY");
      expect(q).toBeDefined();
      expect(q?.detail ?? "").not.toContain(VALID_BSN);
    });

    it("adds and ends an identifier", async () => {
      const { provider } = await setup();
      const ref = await provider.createParty(sampleParty(), TEST_CTX);
      await provider.addIdentifier(ref.id, "mrn", "MRN-007", TEST_CTX);
      const withMrn = await provider.getParty(ref.id, {}, TEST_CTX);
      const mrn = withMrn?.identifiers.find((i) => i.namespace === "mrn");
      expect(mrn).toBeDefined();
      expect(mrn?.id).toBeTruthy();
      await provider.endIdentifier(ref.id, mrn?.id ?? "", TEST_CTX);
      const ended = await provider.getParty(ref.id, {}, TEST_CTX);
      // Adapter-agnostic: the identifier is no longer ACTIVE — built-in keeps the
      // row with `end` set; FHIR R4 (no per-id end date) drops it. Both → inactive.
      expect(ended?.identifiers.some((i) => i.namespace === "mrn" && !i.end)).toBe(false);
    });

    if (opts.enforcesUniqueIdentifier) {
      it("rejects a second active party with the same identifier", async () => {
        const { provider } = await setup();
        await provider.createParty(sampleParty(), TEST_CTX);
        await expect(provider.createParty(sampleParty(), TEST_CTX)).rejects.toThrow();
      });
    }

    it("deactivates a party so it drops out of search", async () => {
      const { provider } = await setup();
      const ref = await provider.createParty(sampleParty(), TEST_CTX);
      await provider.deactivateParty(ref.id, "duplicate record", TEST_CTX);
      const got = await provider.getParty(ref.id, {}, TEST_CTX);
      expect(got?.active).toBe(false);
      const search = await provider.searchParty(
        { identifier: { namespace: "nl-bsn", value: VALID_BSN }, limit: 20, offset: 0 },
        TEST_CTX,
      );
      expect(search.total).toBe(0);
    });

    if (opts.supportsMerge) {
      it("merges a party into another (source deactivated, target stays active)", async () => {
        const { provider } = await setup();
        const into = await provider.createParty(sampleParty(), TEST_CTX);
        const from = await provider.createParty(
          sampleParty({ identifiers: [{ namespace: "mrn", value: "MRN-DUP-1" }] }),
          TEST_CTX,
        );
        await provider.mergeParty(into.id, from.id, TEST_CTX);
        const merged = await provider.getParty(from.id, {}, TEST_CTX);
        expect(merged?.active).toBe(false);
        const target = await provider.getParty(into.id, {}, TEST_CTX);
        expect(target?.active).toBe(true);
        const search = await provider.searchParty(
          { identifier: { namespace: "mrn", value: "MRN-DUP-1" }, limit: 20, offset: 0 },
          TEST_CTX,
        );
        expect(search.total).toBe(0);
      });
    }

    if (opts.supportsRelationships) {
      it("creates and ends a relationship", async () => {
        const { provider } = await setup();
        const a = await provider.createParty(sampleParty(), TEST_CTX);
        const b = await provider.createParty(
          sampleParty({ identifiers: [{ namespace: "mrn", value: "MRN-KIN-1" }] }),
          TEST_CTX,
        );
        const rel = await provider.addRelationship(
          { source: a.id, target: b.id, type: "next-of-kin" },
          TEST_CTX,
        );
        expect(rel.id).toBeTruthy();
        await provider.endRelationship(rel.id, TEST_CTX);
      });
    }
  });
}
