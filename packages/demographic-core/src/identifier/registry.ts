// Identifier-namespace registry (ADR-0031). Maps a stable internal namespace key
// — used verbatim as the openEHR `PARTY_IDENTIFIED.external_ref.namespace` and as
// the FHIR `Patient.identifier.system` — to its country, canonical system URI,
// and checksum validator. Adapters look identifiers up here; the registry is the
// single source of truth so a national-ID scheme is defined once.
//
// `label` is a developer-facing tag only — every user-visible string goes through
// Paraglide in the UI (CLAUDE.md rule 4).

import {
  isNonEmpty,
  isValidBsn,
  isValidCodiceFiscaleFormat,
  isValidKvnr,
  isValidNif,
  isValidNir,
  isValidNiss,
  isValidPesel,
  isValidSpanishId,
} from "./validators.ts";

export interface IdentifierNamespace {
  /** Stable key; also the openEHR external_ref namespace. */
  key: string;
  /** ISO 3166-1 alpha-2 country, or "INT" for deployment-local / opaque schemes. */
  country: string;
  /** Developer-facing label (not UI copy). */
  label: string;
  /** Canonical system URI for FHIR Patient.identifier.system. */
  system: string;
  /** True when `validate` enforces a real checksum (vs structural/opaque only). */
  checksum: boolean;
  validate: (value: string) => boolean;
}

// Canonical system URIs: established FHIR NamingSystem URIs where they exist,
// else the country's HL7 OID in urn:oid form.
export const IDENTIFIER_NAMESPACES: Record<string, IdentifierNamespace> = {
  "nl-bsn": {
    key: "nl-bsn",
    country: "NL",
    label: "Burgerservicenummer",
    system: "http://fhir.nl/fhir/NamingSystem/bsn",
    checksum: true,
    validate: isValidBsn,
  },
  "be-niss": {
    key: "be-niss",
    country: "BE",
    label: "Rijksregisternummer (NISS)",
    system: "urn:oid:2.16.56.1.1.1.50.4",
    checksum: true,
    validate: isValidNiss,
  },
  "fr-nir": {
    key: "fr-nir",
    country: "FR",
    label: "NIR / INS-NIR",
    system: "urn:oid:1.2.250.1.213.1.4.8",
    checksum: true,
    validate: isValidNir,
  },
  "de-kvnr": {
    key: "de-kvnr",
    country: "DE",
    label: "Krankenversichertennummer",
    system: "http://fhir.de/sid/gkv/kvid-10",
    checksum: true,
    validate: isValidKvnr,
  },
  "it-cf": {
    key: "it-cf",
    country: "IT",
    label: "Codice Fiscale",
    system: "urn:oid:2.16.840.1.113883.2.9.4.3.2",
    checksum: false, // structural format; full odd/even checksum is a v1.x refinement
    validate: isValidCodiceFiscaleFormat,
  },
  "es-dni": {
    key: "es-dni",
    country: "ES",
    label: "DNI / NIE",
    system: "urn:oid:1.3.6.1.4.1.19126.3",
    checksum: true,
    validate: isValidSpanishId,
  },
  "pt-nif": {
    key: "pt-nif",
    country: "PT",
    label: "NIF",
    system: "urn:oid:2.16.620.1.100.2.1",
    checksum: true,
    validate: isValidNif,
  },
  "at-bpk": {
    key: "at-bpk",
    country: "AT",
    label: "bereichsspezifisches Personenkennzeichen",
    system: "urn:oid:1.2.40.0.10.2.1.1.149",
    checksum: false, // opaque cryptographic token
    validate: isNonEmpty,
  },
  "pl-pesel": {
    key: "pl-pesel",
    country: "PL",
    label: "PESEL",
    system: "urn:oid:2.16.616.1.101.3.3.1.1",
    checksum: true,
    validate: isValidPesel,
  },
  mrn: {
    key: "mrn",
    country: "INT",
    label: "Medical Record Number",
    system: "urn:ehrbase-ui:mrn", // deployment overrides per local assigning authority
    checksum: false,
    validate: isNonEmpty,
  },
};

/** Look up a namespace by key, or undefined when it is not registered. */
export function getNamespace(key: string): IdentifierNamespace | undefined {
  return IDENTIFIER_NAMESPACES[key];
}

export interface IdentifierValidation {
  valid: boolean;
  /** false when the namespace is not registered — then we fall back to opaque (non-empty). */
  known: boolean;
}

/**
 * Validate an identifier value against its namespace. Unknown namespaces are
 * treated as opaque deployment-local schemes (accepted if non-empty) so a site
 * can use a custom assigning authority without a code change.
 */
export function validateIdentifier(namespaceKey: string, value: string): IdentifierValidation {
  const ns = getNamespace(namespaceKey);
  if (!ns) return { valid: isNonEmpty(value), known: false };
  return { valid: ns.validate(value), known: true };
}
