// FHIR R4 Patient ↔ canonical Party mapping (ADR-0033). The app speaks the
// provider-independent Party from @ehrbase-ui/demographic-core; this module is
// the only place FHIR-specific shapes appear. Identifier `system` URIs map to/
// from the national-ID registry namespaces (the same registry the built-in
// adapter uses), so a BSN is "nl-bsn" app-side regardless of provider.
//
// Lossy edges (documented in ADR-0033): PartyIdentity.details rich structure →
// flat identifier value; PARTY versioning → Patient.meta.versionId.

import {
  IDENTIFIER_NAMESPACES,
  PartySchema,
  type Address,
  type ContactPoint,
  type HumanName,
  type Party,
  type PartyIdentifier,
} from "@ehrbase-ui/demographic-core";

import { type FhirPatient } from "./fhir-types.ts";

// system URI → namespace key (reverse of the registry's `system`).
const SYSTEM_TO_NAMESPACE: Record<string, string> = Object.fromEntries(
  Object.values(IDENTIFIER_NAMESPACES).map((ns) => [ns.system, ns.key]),
);

function namespaceToSystem(namespace: string): string {
  return IDENTIFIER_NAMESPACES[namespace]?.system ?? namespace;
}
function systemToNamespace(system: string | undefined): string {
  if (!system) return "unknown";
  return SYSTEM_TO_NAMESPACE[system] ?? system;
}

// A FHIR identifier carries no stable per-row id, but endIdentifier needs one;
// synthesise a deterministic id from namespace+value so it round-trips.
function identifierId(namespace: string, value: string): string {
  return `${namespace}|${value}`;
}

// `as const` arrays + .find() narrow a wire string to the typed literal union
// with NO type assertion (rule 3 — consistent-type-assertions: never).
const NAME_USES = ["official", "usual", "maiden", "nickname"] as const;
const ADDRESS_USES = ["home", "work", "temp", "old"] as const;
const CONTACT_SYSTEMS = ["phone", "email", "fax", "url", "sms", "other"] as const;
const CONTACT_USES = ["home", "work", "mobile", "temp"] as const;

function nameUse(use: string | undefined): HumanName["use"] {
  return NAME_USES.find((u) => u === use);
}
function addressUse(use: string | undefined): Address["use"] {
  return ADDRESS_USES.find((u) => u === use);
}
function contactSystem(system: string | undefined): ContactPoint["system"] {
  return CONTACT_SYSTEMS.find((s) => s === system) ?? "other";
}
function contactUse(use: string | undefined): ContactPoint["use"] {
  return CONTACT_USES.find((u) => u === use);
}

function deceasedOf(patient: FhirPatient): boolean | string | undefined {
  if (patient.deceasedDateTime) return patient.deceasedDateTime;
  if (typeof patient.deceasedBoolean === "boolean") return patient.deceasedBoolean;
  return undefined;
}

/** FHIR Patient → canonical Party (validated). */
export function patientToParty(patient: FhirPatient): Party {
  const identifiers: PartyIdentifier[] = (patient.identifier ?? [])
    .filter((i) => i.value)
    .map((i) => {
      const namespace = systemToNamespace(i.system);
      const value = i.value ?? "";
      return { namespace, value, id: identifierId(namespace, value) };
    });

  const names: HumanName[] = (patient.name ?? []).map((n) => ({
    use: nameUse(n.use),
    family: n.family,
    given: n.given ?? [],
    prefix: n.prefix ?? [],
    suffix: n.suffix ?? [],
    text: n.text,
  }));

  const addresses: Address[] = (patient.address ?? []).map((a) => ({
    use: addressUse(a.use),
    lines: a.line ?? [],
    city: a.city,
    postalCode: a.postalCode,
    country: a.country,
  }));

  const contacts: ContactPoint[] = (patient.telecom ?? [])
    .filter((t) => t.value)
    .map((t) => ({ system: contactSystem(t.system), value: t.value ?? "", use: contactUse(t.use) }));

  const version = Number.parseInt(patient.meta?.versionId ?? "1", 10);

  return PartySchema.parse({
    id: patient.id ?? "",
    active: patient.active ?? true,
    version: Number.isFinite(version) && version > 0 ? version : 1,
    identifiers,
    names,
    gender: patient.gender,
    birthDate: patient.birthDate,
    deceased: deceasedOf(patient),
    addresses,
    contacts,
  });
}

/** Canonical Party → FHIR Patient (for create/update). id omitted on create. */
export function partyToPatient(party: Party): FhirPatient {
  const patient: FhirPatient = {
    resourceType: "Patient",
    active: party.active,
    identifier: party.identifiers
      .filter((i) => !i.end)
      .map((i) => ({ system: namespaceToSystem(i.namespace), value: i.value })),
    name: party.names.map((n) => ({
      use: n.use,
      family: n.family,
      given: n.given,
      prefix: n.prefix,
      suffix: n.suffix,
      text: n.text,
    })),
    gender: party.gender,
    birthDate: party.birthDate,
    address: party.addresses.map((a) => ({
      use: a.use,
      line: a.lines,
      city: a.city,
      postalCode: a.postalCode,
      country: a.country,
    })),
    telecom: party.contacts.map((c) => ({ system: c.system, value: c.value, use: c.use })),
  };
  if (party.id) patient.id = party.id;
  if (typeof party.deceased === "boolean") patient.deceasedBoolean = party.deceased;
  else if (typeof party.deceased === "string") patient.deceasedDateTime = party.deceased;
  return patient;
}

export { identifierId, namespaceToSystem };
