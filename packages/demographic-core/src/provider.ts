// DemographicProvider — the interface every adapter implements (ADR-0031), plus
// the canonical, PROVIDER-INDEPENDENT types the rest of the app speaks. Adapters
// translate between this shape and their backend (the built-in Postgres adapter
// maps to/from openEHR RM PERSON/PARTY_IDENTITY/CONTACT/ADDRESS/ROLE/
// PARTY_RELATIONSHIP from @ehrbase-ui/openehr-rm; the FHIR adapter maps to/from
// R4 Patient — ADR-0033). The app never sees adapter-specific payloads.
//
// Design note: the canonical app-facing `Party` is a clean domain projection
// (FHIR-Patient-shaped), not the raw RM PERSON tree. This satisfies ADR-0031's
// core intent — ONE provider-independent shape so no clinical surface switches on
// provider type — while keeping the banner/search/admin code ergonomic. The RM
// PERSON canonical form is an internal storage/wire concern of the built-in
// (openEHR) adapter, not the cross-app vocabulary.

import { z } from "zod";

// ─── PartyRef — the Inviolable-rule-12 external reference ──────────────────────
// Placed verbatim in EHR_STATUS.subject as PARTY_IDENTIFIED.external_ref. NO
// demographic data ever lives inline in a composition — only this reference.
export const PartyRefSchema = z.object({
  /** The active provider's namespace for party ids. */
  namespace: z.string().min(1),
  /** The provider's stable party id. */
  id: z.string().min(1),
  // Deliberately narrowed to PERSON for M7 (patient identity). openEHR PARTY_REF
  // also admits ORGANISATION / GROUP / AGENT / ROLE; a future adapter that needs
  // those widens this literal — it is NOT a universal constraint.
  type: z.literal("PERSON"),
});
export type PartyRef = z.infer<typeof PartyRefSchema>;

// ─── Canonical domain types ────────────────────────────────────────────────────
export const PartyIdentifierSchema = z.object({
  /** Registry namespace key (e.g. "nl-bsn"); see ./identifier/registry. */
  namespace: z.string().min(1),
  value: z.string().min(1),
  /** Optional period of validity (ISO-8601). */
  start: z.iso.datetime().optional(),
  end: z.iso.datetime().optional(),
  /** Provider-assigned id for the identifier row (used by endIdentifier). */
  id: z.string().optional(),
});
export type PartyIdentifier = z.infer<typeof PartyIdentifierSchema>;

export const HumanNameSchema = z.object({
  use: z.enum(["official", "usual", "maiden", "nickname"]).optional(),
  family: z.string().optional(),
  given: z.array(z.string()).default([]),
  prefix: z.array(z.string()).default([]),
  suffix: z.array(z.string()).default([]),
  /** Pre-composed display text when components are not separable. */
  text: z.string().optional(),
});
export type HumanName = z.infer<typeof HumanNameSchema>;

export const AddressSchema = z.object({
  use: z.enum(["home", "work", "temp", "old"]).optional(),
  lines: z.array(z.string()).default([]),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  /** ISO 3166-1 alpha-2. */
  country: z.string().optional(),
});
export type Address = z.infer<typeof AddressSchema>;

export const ContactPointSchema = z.object({
  system: z.enum(["phone", "email", "fax", "url", "sms", "other"]),
  value: z.string().min(1),
  use: z.enum(["home", "work", "mobile", "temp"]).optional(),
});
export type ContactPoint = z.infer<typeof ContactPointSchema>;

export const AdministrativeGenderSchema = z.enum(["male", "female", "other", "unknown"]);
export type AdministrativeGender = z.infer<typeof AdministrativeGenderSchema>;

export const PartySchema = z.object({
  id: z.string().min(1),
  active: z.boolean(),
  /** VERSIONED_PARTY version number (1-based); FHIR adapters map meta.versionId. */
  version: z.number().int().positive(),
  identifiers: z.array(PartyIdentifierSchema),
  names: z.array(HumanNameSchema),
  gender: AdministrativeGenderSchema.optional(),
  /** ISO date; partial dates (YYYY / YYYY-MM) permitted per openEHR DV_DATE. */
  birthDate: z.string().optional(),
  /** true/false, or an ISO date/datetime of death. */
  deceased: z.union([z.boolean(), z.string()]).optional(),
  addresses: z.array(AddressSchema),
  contacts: z.array(ContactPointSchema),
});
export type Party = z.infer<typeof PartySchema>;

// ─── Operation inputs ──────────────────────────────────────────────────────────
export const CreatePartyInputSchema = z.object({
  identifiers: z.array(PartyIdentifierSchema).min(1),
  names: z.array(HumanNameSchema).min(1),
  gender: AdministrativeGenderSchema.optional(),
  birthDate: z.string().optional(),
  deceased: z.union([z.boolean(), z.string()]).optional(),
  addresses: z.array(AddressSchema).default([]),
  contacts: z.array(ContactPointSchema).default([]),
});
export type CreatePartyInput = z.infer<typeof CreatePartyInputSchema>;

/** Patch semantics: present fields replace, absent fields are unchanged. */
export const UpdatePartyInputSchema = CreatePartyInputSchema.partial();
export type UpdatePartyInput = z.infer<typeof UpdatePartyInputSchema>;

export const PartySearchQuerySchema = z.object({
  identifier: z.object({ namespace: z.string().min(1), value: z.string().min(1) }).optional(),
  family: z.string().optional(),
  given: z.string().optional(),
  birthDate: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});
export type PartySearchQuery = z.infer<typeof PartySearchQuerySchema>;

export interface PartySearchResult {
  parties: Party[];
  total: number;
}

export const RelationshipTypeSchema = z.enum([
  "next-of-kin",
  "emergency-contact",
  "guardian",
  "parent",
  "child",
  "spouse",
  "caregiver",
  "other",
]);
export type RelationshipType = z.infer<typeof RelationshipTypeSchema>;

export const CreateRelationshipInputSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  type: RelationshipTypeSchema,
  start: z.iso.datetime().optional(),
  end: z.iso.datetime().optional(),
});
export type CreateRelationshipInput = z.infer<typeof CreateRelationshipInputSchema>;

export interface RelationshipRef {
  id: string;
}
export interface PartyVersionRef {
  version: number;
  committedAt: string;
}

/** Auth + audit context threaded through every provider op (NEN-7513). */
export interface ProviderContext {
  actor: { userId: string; username: string; displayName: string; roles: string[] };
  sessionId: string;
  correlationId?: string;
}

export interface DemographicProviderCapabilities {
  supportsMutation: boolean;
  supportsMerge: boolean;
  /** When true the admin UI shows a read-only banner; writes are capability-gated. */
  readonly: boolean;
}

export interface DemographicProvider {
  /** Adapter name; lands in the NEN-7513 audit event's source.adapterName (ADR-0031). */
  readonly name: string;
  readonly capabilities: DemographicProviderCapabilities;

  createParty(input: CreatePartyInput, ctx: ProviderContext): Promise<PartyRef>;
  updateParty(id: string, input: UpdatePartyInput, ctx: ProviderContext): Promise<PartyRef>;
  getParty(id: string, opts: { version?: number }, ctx: ProviderContext): Promise<Party | null>;
  searchParty(query: PartySearchQuery, ctx: ProviderContext): Promise<PartySearchResult>;
  deactivateParty(id: string, justification: string, ctx: ProviderContext): Promise<void>;
  /**
   * Merge `from` into `into`: `from` is deactivated and tombstoned to `into` (a
   * lookup by `from`'s identifier then returns nothing — correct deduplication).
   * It is intentionally NOT an identifier union: identifiers are NOT auto-moved
   * to `into` (that could violate the one-active-party-per-identifier guard and
   * is a clinical-policy decision). To carry a surviving identifier across, the
   * caller issues an explicit `addIdentifier(into, …)` after the merge.
   */
  mergeParty(into: string, from: string, ctx: ProviderContext): Promise<void>;
  addIdentifier(partyId: string, namespace: string, value: string, ctx: ProviderContext): Promise<void>;
  endIdentifier(partyId: string, identifierId: string, ctx: ProviderContext): Promise<void>;
  addRelationship(input: CreateRelationshipInput, ctx: ProviderContext): Promise<RelationshipRef>;
  endRelationship(id: string, ctx: ProviderContext): Promise<void>;
  listVersions(partyId: string, ctx: ProviderContext): Promise<PartyVersionRef[]>;
}
