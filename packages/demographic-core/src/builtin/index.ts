// @ehrbase-ui/demographic-core/builtin — the built-in Postgres DemographicProvider
// (default; DEMOGRAPHIC_PROVIDER=builtin). VERSIONED_PARTY semantics in the
// `demographic` schema on platform-db (ADR-0031; arch §M7).

export {
  BuiltinDemographicProvider,
  type BuiltinProviderDeps,
  type DemographicDb,
} from "./adapter.ts";
// Error classes are the shared cross-adapter vocabulary — exported from the
// package root barrel (@ehrbase-ui/demographic-core), not here.
export {
  demographicChangeTypeEnum,
  demographicGenderEnum,
  demographicParty,
  demographicPartyHistory,
  demographicPartyIdentifier,
  demographicPartyName,
  demographicRelationship,
  demographicRelationshipTypeEnum,
  demographicSchema,
} from "./schema.ts";

import { BuiltinDemographicProvider, type BuiltinProviderDeps } from "./adapter.ts";

/** Construct the built-in provider. apps/web's factory injects db + audit + pseudonymize. */
export function createBuiltinProvider(deps: BuiltinProviderDeps): BuiltinDemographicProvider {
  return new BuiltinDemographicProvider(deps);
}
