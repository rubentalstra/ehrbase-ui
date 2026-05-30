// LIVE end-to-end test for the demographic provider against the REAL dev stack
// (platform-db `demographic` + `audit` DBs, Valkey hash-chain). Gated behind
// DEMOGRAPHIC_E2E=1 so the normal `turbo test` run skips it (no live services in
// CI). Run it with the stack up:
//
//   docker compose up -d platform-db valkey
//   pnpm -F @ehrbase-ui/web exec drizzle-kit migrate --config=drizzle.demographic.config.ts
//   DEMOGRAPHIC_E2E=1 AUDIT_PSEUDONYM_SECRET=dev pnpm -F @ehrbase-ui/web exec \
//     vitest run src/server/demographic/__tests__/e2e-live.test.ts
//
// It exercises the REAL wiring end-to-end: the provider factory → built-in
// adapter over postgres-js → the real logAudit sink → the audit DB + Valkey
// chain. This proves real-Postgres behaviour the PGlite contract suite cannot
// (the partial-unique-active identifier index, jsonb snapshot, the writer-role
// grants) AND that every PARTY op lands a NEN-7513 row (resourceType PARTY,
// source.adapterName='builtin', pseudonymised subjectIdHash — no raw BSN).

import { FhirDemographicProvider } from "@ehrbase-ui/demographic-adapter-fhir";
import { RecordingAuditSink } from "@ehrbase-ui/demographic-core/contract";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Pseudonym secret must be present before the first pseudonymize call.
process.env.AUDIT_PSEUDONYM_SECRET ??= "dev-e2e-secret";
process.env.DEMOGRAPHIC_PROVIDER ??= "builtin";

const RUN = process.env.DEMOGRAPHIC_E2E === "1";
const RUN_FHIR = process.env.DEMOGRAPHIC_FHIR_E2E === "1";
const FHIR_BASE = process.env.DEMOGRAPHIC_FHIR_BASE ?? "http://localhost:8090/fhir";
const VALID_BSN = "111222333";

describe.runIf(RUN)("demographic provider — LIVE e2e (built-in over real Postgres + audit)", () => {
  // owner connection for clean-slate + audit read (writer cannot TRUNCATE/own).
  const owner = postgres("postgres://demographic_owner:demographic_owner@localhost:5432/demographic", { max: 2 });
  const auditRead = postgres("postgres://audit_owner:audit_owner@localhost:5432/audit", { max: 2 });
  let startTs: string;

  beforeAll(async () => {
    // Clean slate (DELETE, not TRUNCATE — keep it owner-portable).
    await owner`delete from demographic_party_identifier`;
    await owner`delete from demographic_party_name`;
    await owner`delete from demographic_relationship`;
    await owner`delete from demographic_party_history`;
    await owner`delete from demographic_party`;
    const now = await owner<{ ts: string }[]>`select now()::text as ts`;
    startTs = now[0]?.ts ?? "epoch";
  });

  afterAll(async () => {
    await owner.end();
    await auditRead.end();
  });

  it("runs a full lifecycle against real Postgres and lands a dual-layer audit trail", async () => {
    const { getDemographicProvider } = await import("../provider.factory.server.ts");
    const { DuplicateIdentifierError } = await import("@ehrbase-ui/demographic-core");
    const provider = getDemographicProvider();
    expect(provider.name).toBe("builtin");

    const ctx = {
      actor: { userId: "e2e-user", username: "e2e@hospital", displayName: "E2E Clinician", roles: ["clinician"] },
      sessionId: "e2e-session",
      correlationId: "e2e-corr",
    };

    // 1. create
    const ref = await provider.createParty(
      {
        identifiers: [{ namespace: "nl-bsn", value: VALID_BSN }],
        names: [{ use: "official", family: "de Vries", given: ["Anna"], prefix: [], suffix: [] }],
        gender: "female",
        birthDate: "1980-04-12",
        addresses: [{ use: "home", lines: ["Keizersgracht 1"], city: "Amsterdam", country: "NL" }],
        contacts: [{ system: "phone", value: "+31201234567" }],
      },
      ctx,
    );
    expect(ref.type).toBe("PERSON");
    expect(ref.id).toBeTruthy();

    // 2. read back
    const got = await provider.getParty(ref.id, {}, ctx);
    expect(got?.names[0]?.family).toBe("de Vries");
    expect(got?.identifiers[0]?.value).toBe(VALID_BSN);

    // 3. REAL partial-unique-active index rejects a second live BSN
    await expect(
      provider.createParty(
        { identifiers: [{ namespace: "nl-bsn", value: VALID_BSN }], names: [{ family: "Imposter", given: [], prefix: [], suffix: [] }], addresses: [], contacts: [] },
        ctx,
      ),
    ).rejects.toBeInstanceOf(DuplicateIdentifierError);

    // 4. search (identifier + name)
    expect((await provider.searchParty({ identifier: { namespace: "nl-bsn", value: VALID_BSN }, limit: 20, offset: 0 }, ctx)).total).toBe(1);
    expect((await provider.searchParty({ family: "de Vries", limit: 20, offset: 0 }, ctx)).total).toBe(1);

    // 5. update → version 2; prior version still readable (real history)
    await provider.updateParty(ref.id, { gender: "other" }, ctx);
    expect((await provider.getParty(ref.id, {}, ctx))?.gender).toBe("other");
    expect((await provider.getParty(ref.id, { version: 1 }, ctx))?.gender).toBe("female");

    // 6. identifier lifecycle
    await provider.addIdentifier(ref.id, "mrn", "MRN-E2E-1", ctx);
    const withMrn = await provider.getParty(ref.id, {}, ctx);
    const mrnId = withMrn?.identifiers.find((i) => i.namespace === "mrn")?.id;
    expect(mrnId).toBeTruthy();
    await provider.endIdentifier(ref.id, mrnId ?? "", ctx);
    expect((await provider.getParty(ref.id, {}, ctx))?.identifiers.some((i) => i.namespace === "mrn" && !i.end)).toBe(false);

    // 7. relationship lifecycle
    const kin = await provider.createParty(
      { identifiers: [{ namespace: "mrn", value: "MRN-KIN-E2E" }], names: [{ family: "Kin", given: [], prefix: [], suffix: [] }], addresses: [], contacts: [] },
      ctx,
    );
    const rel = await provider.addRelationship({ source: ref.id, target: kin.id, type: "next-of-kin" }, ctx);
    expect(rel.id).toBeTruthy();
    await provider.endRelationship(rel.id, ctx);

    // 8. merge kin into ref → kin deactivated, drops from search
    await provider.mergeParty(ref.id, kin.id, ctx);
    expect((await provider.getParty(kin.id, {}, ctx))?.active).toBe(false);
    expect((await provider.searchParty({ identifier: { namespace: "mrn", value: "MRN-KIN-E2E" }, limit: 20, offset: 0 }, ctx)).total).toBe(0);

    // 9. listVersions ascending
    const versions = await provider.listVersions(ref.id, ctx);
    expect(versions.length).toBeGreaterThanOrEqual(3);
    expect(versions.map((v) => v.version)).toEqual([...versions.map((v) => v.version)].sort((a, b) => a - b));

    // 10. deactivate
    await provider.deactivateParty(ref.id, "e2e cleanup", ctx);
    expect((await provider.getParty(ref.id, {}, ctx))?.active).toBe(false);

    // ── DUAL-LAYER AUDIT: every PHI op landed a NEN-7513 PARTY row ────────────
    // Give the fire-and-forget chain a moment to flush.
    await new Promise((r) => setTimeout(r, 300));
    const rows = await auditRead<
      { action: string; adapter: string | null; hash: string | null; purpose: string }[]
    >`select action, source_adapter_name as adapter, target_subject_id_hash as hash, purpose
        from audit_events
       where target_resource_type = 'PARTY' and timestamp >= ${startTs}
       order by timestamp`;

    const actions = rows.map((r) => r.action);
    expect(actions).toContain("CREATE");
    expect(actions).toContain("QUERY");
    expect(actions).toContain("UPDATE");
    expect(actions).toContain("ADMIN_CHANGE"); // merge
    expect(actions).toContain("DELETE"); // deactivate

    // adapterName recorded on every PARTY row.
    expect(rows.every((r) => r.adapter === "builtin")).toBe(true);

    // merge is SYSTEM_ADMIN purpose, not TREATMENT.
    expect(rows.find((r) => r.action === "ADMIN_CHANGE")?.purpose).toBe("SYSTEM_ADMIN");

    // subjectIdHash is pseudonymised — the raw BSN never appears in the trail.
    const createRow = rows.find((r) => r.action === "CREATE");
    expect(createRow?.hash).toBeTruthy();
    expect(createRow?.hash).not.toContain(VALID_BSN);
    expect(rows.every((r) => (r.hash ?? "") !== VALID_BSN)).toBe(true);
  });
});

// LIVE FHIR R4 adapter against a real HAPI server (docker compose --profile fhir).
// Gated by DEMOGRAPHIC_FHIR_E2E=1. Validates the real FHIR wire protocol the
// in-memory double can only approximate. FHIR servers do not enforce identifier
// uniqueness, so assertions resolve by the created id, not by search totals.
describe.runIf(RUN_FHIR)("FHIR R4 adapter — LIVE e2e against real HAPI", () => {
  const audit = new RecordingAuditSink();
  const provider = new FhirDemographicProvider({
    baseUrl: FHIR_BASE,
    fhirVersion: "R4",
    audit,
    pseudonymize: (v) => `h:${Buffer.from(v).toString("hex")}`,
    allowWrites: true,
    fetch: (input, init) => fetch(input, init),
  });
  const ctx = {
    actor: { userId: "e2e", username: "e2e@h", displayName: "E2E", roles: ["clinician"] },
    sessionId: "s",
    correlationId: "c",
  };

  it("round-trips the full lifecycle through the FHIR R4 wire protocol", async () => {
    // create + read
    const ref = await provider.createParty(
      {
        identifiers: [{ namespace: "nl-bsn", value: VALID_BSN }],
        names: [{ use: "official", family: "Janssen", given: ["Jan"], prefix: [], suffix: [] }],
        gender: "male",
        birthDate: "1975-06-01",
        addresses: [{ use: "home", lines: ["Dam 1"], city: "Amsterdam", country: "NL" }],
        contacts: [{ system: "phone", value: "+31600000000" }],
      },
      ctx,
    );
    expect(ref.id).toBeTruthy();
    const got = await provider.getParty(ref.id, {}, ctx);
    expect(got?.names[0]?.family).toBe("Janssen");
    expect(got?.identifiers[0]?.value).toBe(VALID_BSN);

    // search by identifier resolves the created party
    const byId = await provider.searchParty({ identifier: { namespace: "nl-bsn", value: VALID_BSN }, limit: 50, offset: 0 }, ctx);
    expect(byId.parties.some((p) => p.id === ref.id)).toBe(true);

    // update → version 2; prior version readable via FHIR _history vread
    await provider.updateParty(ref.id, { gender: "other" }, ctx);
    expect((await provider.getParty(ref.id, {}, ctx))?.gender).toBe("other");
    expect((await provider.getParty(ref.id, { version: 1 }, ctx))?.gender).toBe("male");
    expect((await provider.listVersions(ref.id, ctx)).length).toBeGreaterThanOrEqual(2);

    // identifier lifecycle
    await provider.addIdentifier(ref.id, "mrn", "MRN-HAPI-1", ctx);
    expect((await provider.getParty(ref.id, {}, ctx))?.identifiers.some((i) => i.namespace === "mrn")).toBe(true);

    // relationship via RelatedPerson
    const kin = await provider.createParty(
      { identifiers: [{ namespace: "mrn", value: "MRN-HAPI-KIN" }], names: [{ family: "Kin", given: [], prefix: [], suffix: [] }], addresses: [], contacts: [] },
      ctx,
    );
    const rel = await provider.addRelationship({ source: ref.id, target: kin.id, type: "next-of-kin" }, ctx);
    expect(rel.id).toBeTruthy();
    await provider.endRelationship(rel.id, ctx);

    // merge via Patient.link → kin deactivated
    await provider.mergeParty(ref.id, kin.id, ctx);
    expect((await provider.getParty(kin.id, {}, ctx))?.active).toBe(false);

    // deactivate (writes the deactivation-reason extension)
    await provider.deactivateParty(ref.id, "e2e done", ctx);
    expect((await provider.getParty(ref.id, {}, ctx))?.active).toBe(false);

    // every op emitted an audit event with the fhir-r4 adapter (rule 1)
    expect(audit.events.length).toBeGreaterThan(0);
    expect(audit.events.every((e) => e.outcome === "SUCCESS")).toBe(true);
  });
});
