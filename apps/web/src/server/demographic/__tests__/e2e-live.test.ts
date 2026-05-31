// LIVE end-to-end test for the demographic provider against the REAL dev stack
// (platform-db `demographic` DB). Gated behind DEMOGRAPHIC_E2E=1 so the normal
// `turbo test` run skips it (no live services in CI). Run it with the stack up:
//
//   docker compose up -d platform-db valkey
//   pnpm -F @ehrbase-ui/web exec drizzle-kit migrate --config=drizzle.demographic.config.ts
//   DEMOGRAPHIC_E2E=1 AUDIT_PSEUDONYM_SECRET=dev pnpm -F @ehrbase-ui/web exec \
//     vitest run src/server/demographic/__tests__/e2e-live.test.ts
//
// It exercises the REAL wiring end-to-end: the provider factory → built-in
// adapter over postgres-js → real Postgres. This proves real-Postgres
// behaviour the PGlite contract suite cannot (the partial-unique-active
// identifier index, jsonb snapshot, the writer-role grants).

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Pseudonym secret must be present before the first pseudonymize call.
process.env.AUDIT_PSEUDONYM_SECRET ??= "dev-e2e-secret";
process.env.DEMOGRAPHIC_PROVIDER ??= "builtin";

const RUN = process.env.DEMOGRAPHIC_E2E === "1";
const VALID_BSN = "111222333";

describe.runIf(RUN)("demographic provider — LIVE e2e (built-in over real Postgres)", () => {
  // owner connection for clean-slate (writer cannot TRUNCATE/own).
  const owner = postgres("postgres://demographic_owner:demographic_owner@localhost:5432/demographic", { max: 2 });

  beforeAll(async () => {
    // Clean slate (DELETE, not TRUNCATE — keep it owner-portable).
    await owner`delete from demographic_party_identifier`;
    await owner`delete from demographic_party_name`;
    await owner`delete from demographic_relationship`;
    await owner`delete from demographic_party_history`;
    await owner`delete from demographic_party`;
  });

  afterAll(async () => {
    await owner.end();
  });

  it("runs a full lifecycle against real Postgres", async () => {
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
  });
});
