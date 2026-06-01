// The built-in demographic adapter's Drizzle schema is OWNED by the package
// (@ehrbase-ui/demographic-core/builtin) — it is the adapter's storage contract,
// exercised by the package contract suite against PGlite. apps/web re-exports it
// so drizzle-kit (drizzle.demographic.config.ts) generates the migration and the
// runtime client (demographic-client.ts) can query it. Mirrors the audit/auth
// split (ADR-0013, ADR-0031, ADR-0035): schema beside the consumer that needs it,
// migrations + connection + role grants owned by the app.
//
// Only the table/enum entities are re-exported (not the provider class) so
// drizzle-kit sees a clean schema module.

export {
  demographicChangeTypeEnum,
  demographicGenderEnum,
  demographicMrnCounter,
  demographicParty,
  demographicPartyHistory,
  demographicPartyIdentifier,
  demographicPartyName,
  demographicRelationship,
  demographicRelationshipTypeEnum,
} from '@ehrbase-ui/demographic-core/builtin'
