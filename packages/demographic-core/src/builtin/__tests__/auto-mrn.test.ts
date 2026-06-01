// Auto-MRN + partial-DOB search (ADR-0046). Runs against in-process PGlite so the
// counter-table allocation + the prefix birthDate match are exercised for real.

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";

import { RecordingAuditSink } from "../../contract.ts";
import type { ProviderContext } from "../../provider.ts";
import { BuiltinDemographicProvider } from "../adapter.ts";
import type { DemographicDb } from "../adapter.ts";
import { applyDemographicSchema } from "../test-support.ts";

const pseudonymize = (v: string): string => `h:${Buffer.from(v).toString("hex")}`;
const ctx: ProviderContext = {
  actor: { userId: "u1", username: "admin@x", displayName: "Admin", roles: ["admin"] },
  sessionId: "s1",
  correlationId: "c1",
};

let db: DemographicDb;

// Warm ONE PGlite for the suite (cold start ~4-5s would blow the per-test hook
// timeout under the full parallel workspace run); truncate between tests for
// isolation — including the MRN counter so allocation restarts at 0000001.
beforeAll(async () => {
  db = drizzle({ client: new PGlite() });
  await applyDemographicSchema(db);
}, 60_000);

beforeEach(async () => {
  await db.execute(
    sql`truncate table demographic_party, demographic_party_history, demographic_party_identifier, demographic_party_name, demographic_mrn_counter, demographic_relationship`,
  );
});

function provider(autoAssignMrn: boolean): BuiltinDemographicProvider {
  return new BuiltinDemographicProvider({
    db,
    audit: new RecordingAuditSink(),
    pseudonymize,
    autoAssignMrn,
  });
}

const base = {
  names: [{ given: ["Jan"], family: "Janssen", prefix: [], suffix: [] }],
  identifiers: [],
  addresses: [],
  contacts: [],
};

describe("auto-MRN", () => {
  it("assigns a zero-padded MRN when none is supplied", async () => {
    const p = provider(true);
    const ref = await p.createParty(base, ctx);
    const party = await p.getParty(ref.id, {}, ctx);
    const mrn = party?.identifiers.find((i) => i.namespace === "mrn");
    expect(mrn?.value).toBe("0000001");
  });

  it("allocates sequential MRNs across creates", async () => {
    const p = provider(true);
    const a = await p.getParty((await p.createParty(base, ctx)).id, {}, ctx);
    const b = await p.getParty((await p.createParty(base, ctx)).id, {}, ctx);
    expect(a?.identifiers.find((i) => i.namespace === "mrn")?.value).toBe("0000001");
    expect(b?.identifiers.find((i) => i.namespace === "mrn")?.value).toBe("0000002");
  });

  it("does NOT overwrite a supplied MRN", async () => {
    const p = provider(true);
    const ref = await p.createParty(
      { ...base, identifiers: [{ namespace: "mrn", value: "EXISTING-1" }] },
      ctx,
    );
    const party = await p.getParty(ref.id, {}, ctx);
    const mrns = party?.identifiers.filter((i) => i.namespace === "mrn") ?? [];
    expect(mrns).toHaveLength(1);
    expect(mrns[0]?.value).toBe("EXISTING-1");
  });

  it("does not assign an MRN when disabled", async () => {
    const p = provider(false);
    const ref = await p.createParty(
      { ...base, identifiers: [{ namespace: "at-bpk", value: "AT-123" }] },
      ctx,
    );
    const party = await p.getParty(ref.id, {}, ctx);
    expect(party?.identifiers.some((i) => i.namespace === "mrn")).toBe(false);
    expect(party?.identifiers.some((i) => i.namespace === "at-bpk")).toBe(true);
  });

  it("rejects a party with no identifier when auto-MRN is disabled", async () => {
    const p = provider(false);
    await expect(p.createParty(base, ctx)).rejects.toThrow(/identifier/iu);
  });
});

describe("partial-DOB search", () => {
  it("matches a full stored date by year or year-month prefix, and exactly", async () => {
    const p = provider(true); // auto-MRN supplies the required identifier
    await p.createParty({ ...base, birthDate: "1985-03-12" }, ctx);

    const byYear = await p.searchParty({ birthDate: "1985", limit: 20, offset: 0 }, ctx);
    const byYearMonth = await p.searchParty({ birthDate: "1985-03", limit: 20, offset: 0 }, ctx);
    const exact = await p.searchParty({ birthDate: "1985-03-12", limit: 20, offset: 0 }, ctx);
    const miss = await p.searchParty({ birthDate: "1990", limit: 20, offset: 0 }, ctx);

    expect(byYear.total).toBe(1);
    expect(byYearMonth.total).toBe(1);
    expect(exact.total).toBe(1);
    expect(miss.total).toBe(0);
  });
});
