// Drizzle schema for the built-in Postgres demographic adapter (ADR-0031;
// ADR-0023 intent — VERSIONED_PARTY semantics; arch §M7). Lives in the package
// because it IS the adapter's storage contract (the contract suite runs real
// SQL against it via PGlite). apps/web owns the connection, the drizzle-kit
// config, the generated migration, and the role/grant init SQL — mirroring the
// audit/auth split (ADR-0013, ADR-0035).
//
// STORAGE SHAPE — hybrid "current + history JSONB snapshot", the pattern shared
// by EHRbase (hybrid jsonb + extracted index columns), the openEHR
// VERSIONED_OBJECT model (a VERSION<PARTY> is an immutable WHOLE-party snapshot),
// and FHIR servers (current + history tables; our canonical Party is FHIR-shaped):
//   - `demographic_party`         — the CURRENT version, one row per party.
//   - `demographic_party_history` — every prior immutable version (pk id+version).
//   - the full validated Party document lives in `snapshot` (jsonb); the fields
//     we FILTER/SEARCH on are ALSO extracted into typed, indexed columns/tables
//     (`demographic_party_identifier`, `demographic_party_name`).
//   - `demographic_relationship`  — PARTY_RELATIONSHIP (own lifecycle: add/end).
//
// The snapshot is NOT an opaque blob: it is the Zod-`PartySchema`-validated
// canonical Party (no `as`; rule 3). `change_description` maps to the openEHR
// VERSION.audit_details.description; `change_type` to the audit-change-type code
// (creation 249 / modification 251 / deletion 523) at the CONTRIBUTION layer.

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { Party } from "../provider.ts";

// ─── Controlled vocabularies ─────────────────────────────────────────────────
export const demographicGenderEnum = pgEnum("demographic_gender", [
  "male",
  "female",
  "other",
  "unknown",
]);

// Maps to the openEHR audit-change-type terminology at the CONTRIBUTION layer
// (creation=249, modification=251, deletion=523 — see the M6 proxy headers).
export const demographicChangeTypeEnum = pgEnum("demographic_change_type", [
  "creation",
  "modification",
  "deletion",
]);

export const demographicRelationshipTypeEnum = pgEnum("demographic_relationship_type", [
  "next-of-kin",
  "emergency-contact",
  "guardian",
  "parent",
  "child",
  "spouse",
  "caregiver",
  "other",
]);

// Columns shared by the current table and the history table. Declared as a
// factory so the two tables can never drift (one source for the version shape).
function versionColumns() {
  return {
    id: uuid("id").notNull(),
    version: integer("version").notNull(),
    active: boolean("active").notNull(),
    gender: demographicGenderEnum("gender"),
    birthDate: text("birth_date"),
    deceased: text("deceased"),
    // The full Zod-validated canonical Party document (source of truth for reads).
    snapshot: jsonb("snapshot").$type<Party>().notNull(),
    // Tombstone pointer set by mergeParty (the surviving party id).
    mergedInto: uuid("merged_into"),
    // openEHR VERSION.commit_audit equivalents.
    committedAt: timestamp("committed_at", { withTimezone: true, mode: "string" })
      .notNull()
      .default(sql`now()`),
    committerUserId: text("committer_user_id").notNull(),
    committerDisplayName: text("committer_display_name").notNull(),
    changeType: demographicChangeTypeEnum("change_type").notNull(),
    // openEHR VERSION.audit_details.description — the reason for the change.
    changeDescription: text("change_description"),
  };
}

// ─── demographic_party — CURRENT version (one row per party) ──────────────────
export const demographicParty = pgTable(
  "demographic_party",
  {
    ...versionColumns(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    primaryKey({ columns: [t.id] }),
    index("demographic_party_active_idx").on(t.active),
    index("demographic_party_birth_date_idx").on(t.birthDate),
  ],
);

// ─── demographic_party_history — every prior immutable version ────────────────
export const demographicPartyHistory = pgTable(
  "demographic_party_history",
  versionColumns(),
  (t) => [primaryKey({ columns: [t.id, t.version] })],
);

// ─── demographic_party_identifier — extracted CURRENT identifier index ────────
// One row per active identifier of the CURRENT version. Rebuilt on every commit.
// The partial unique index is the clinical-safety guard: two ACTIVE parties can
// never share a live national identifier (e.g. one BSN → one patient).
export const demographicPartyIdentifier = pgTable(
  "demographic_party_identifier",
  {
    partyId: uuid("party_id").notNull(),
    identifierId: text("identifier_id").notNull(),
    namespace: text("namespace").notNull(),
    value: text("value").notNull(),
    start: text("start"),
    end: text("end"),
  },
  (t) => [
    primaryKey({ columns: [t.partyId, t.identifierId] }),
    uniqueIndex("demographic_party_identifier_active_uq")
      .on(t.namespace, t.value)
      .where(sql`${t.end} is null`),
    index("demographic_party_identifier_lookup_idx").on(t.namespace, t.value),
  ],
);

// ─── demographic_party_name — extracted CURRENT name index (search) ───────────
// One row per name of the CURRENT version (a party may have official + maiden).
// Supports searchParty(family/given); rebuilt on every commit.
export const demographicPartyName = pgTable(
  "demographic_party_name",
  {
    partyId: uuid("party_id").notNull(),
    seq: integer("seq").notNull(),
    use: text("use"),
    family: text("family"),
    given: text("given"),
  },
  (t) => [
    primaryKey({ columns: [t.partyId, t.seq] }),
    index("demographic_party_name_family_idx").on(t.family),
    index("demographic_party_name_given_idx").on(t.given),
  ],
);

// ─── demographic_relationship — PARTY_RELATIONSHIP (own lifecycle) ────────────
export const demographicRelationship = pgTable(
  "demographic_relationship",
  {
    id: uuid("id").primaryKey(),
    sourcePartyId: uuid("source_party_id").notNull(),
    targetPartyId: uuid("target_party_id").notNull(),
    type: demographicRelationshipTypeEnum("type").notNull(),
    start: text("start"),
    end: text("end"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("demographic_relationship_source_idx").on(t.sourcePartyId),
    index("demographic_relationship_target_idx").on(t.targetPartyId),
  ],
);

// Barrel object for drizzle({ client, schema }) + apps/web re-export.
export const demographicSchema = {
  demographicParty,
  demographicPartyHistory,
  demographicPartyIdentifier,
  demographicPartyName,
  demographicRelationship,
};
