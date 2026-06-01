// Built-in Postgres adapter — runs the shared DemographicProvider contract suite
// against a real Postgres engine (PGlite, in-process) so the VERSIONED_PARTY SQL
// (jsonb snapshot, partial-unique-active identifier, history) is genuinely
// exercised — not mocked.
//
// One PGlite instance for the whole suite, truncated between tests for isolation
// (a fresh WASM instance per test leaks memory under the full workspace run).

import { beforeAll } from "vitest";

import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";

import {
  RecordingAuditSink,
  runDemographicContractSuite,
  type ContractHarness,
} from "../../contract.ts";
import { BuiltinDemographicProvider } from "../adapter.ts";
import type { DemographicDb } from "../adapter.ts";
import { applyDemographicSchema } from "../test-support.ts";

// Deterministic, secret-free pseudonymiser for tests (prod injects the real
// HMAC-SHA256 keyed by AUDIT_PSEUDONYM_SECRET — see apps/web factory).
const testPseudonymize = (value: string): string =>
  `h:${Buffer.from(value).toString("hex")}`;

let db: DemographicDb | undefined;

async function getDb(): Promise<DemographicDb> {
  if (!db) {
    const created = drizzle({ client: new PGlite() });
    await applyDemographicSchema(created);
    db = created;
  }
  return db;
}

// Warm the PGlite WASM engine ONCE before the suite, with a generous timeout:
// its cold start (~4-5s) can exceed the 5s default test timeout when this suite
// contends with the rest of the workspace under a full-parallel `turbo run test`.
// Paying it in a hook keeps the first contract test from flaking.
beforeAll(async () => {
  await getDb();
}, 60_000);

async function setup(): Promise<ContractHarness> {
  const database = await getDb();
  await database.execute(
    sql`truncate table demographic_party, demographic_party_history, demographic_party_identifier, demographic_party_name, demographic_mrn_counter, demographic_relationship`,
  );
  const audit = new RecordingAuditSink();
  // autoAssignMrn off here so the shared contract assertions (identifier counts)
  // stay MRN-free; auto-MRN has its own dedicated test (auto-mrn.test.ts).
  const provider = new BuiltinDemographicProvider({
    db: database,
    audit,
    pseudonymize: testPseudonymize,
    autoAssignMrn: false,
  });
  return { provider, audit };
}

runDemographicContractSuite("builtin Postgres adapter", setup, {
  supportsHistory: true,
  enforcesUniqueIdentifier: true,
  supportsRelationships: true,
  supportsMerge: true,
});
