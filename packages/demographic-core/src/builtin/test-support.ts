// Test-only: stand up the demographic schema in an ephemeral Postgres (PGlite)
// for the contract suite. Uses drizzle-kit's programmatic pushSchema so the DDL
// is derived from schema.ts itself — ZERO drift between what the contract suite
// runs against and what the generated apps/web migration ships (single source).
//
// NOT exported from the package barrel: it imports drizzle-kit (a devDependency)
// and must never enter a production bundle. The contract suite imports it directly.

import { pushSchema } from "drizzle-kit/api-postgres";

import type { DemographicDb } from "./adapter.ts";
import {
  demographicChangeTypeEnum,
  demographicGenderEnum,
  demographicParty,
  demographicPartyHistory,
  demographicPartyIdentifier,
  demographicPartyName,
  demographicRelationship,
  demographicRelationshipTypeEnum,
} from "./schema.ts";

const SCHEMA_ENTITIES = {
  demographicGenderEnum,
  demographicChangeTypeEnum,
  demographicRelationshipTypeEnum,
  demographicParty,
  demographicPartyHistory,
  demographicPartyIdentifier,
  demographicPartyName,
  demographicRelationship,
};

/** Create every demographic table/enum/index in the given (test) database. */
export async function applyDemographicSchema(db: DemographicDb): Promise<void> {
  const { apply } = await pushSchema(SCHEMA_ENTITIES, db);
  await apply();
}
