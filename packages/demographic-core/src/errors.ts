// Typed errors the built-in adapter throws; the REST layer (apps/web) maps each
// to an HTTP status WITHOUT echoing PHI (rule 2 / §10). Shared with the FHIR
// adapter so the /api/demographic surface has one error vocabulary.

export class DemographicValidationError extends Error {
  readonly code = "VALIDATION";
  constructor(message: string) {
    super(message);
    this.name = "DemographicValidationError";
  }
}

export class DuplicateIdentifierError extends Error {
  readonly code = "DUPLICATE_IDENTIFIER";
  // Accepts ErrorOptions so the originating DB unique-violation is preserved as
  // `cause` (incident triage keeps the Postgres SQLSTATE on the stack; §10).
  constructor(message = "an active party already holds this identifier", options?: ErrorOptions) {
    super(message, options);
    this.name = "DuplicateIdentifierError";
  }
}

export class PartyNotFoundError extends Error {
  readonly code = "NOT_FOUND";
  constructor(message = "party not found") {
    super(message);
    this.name = "PartyNotFoundError";
  }
}

/** Thrown when a capability-gated op is attempted on a read-only provider (FHIR). */
export class CapabilityError extends Error {
  readonly code = "NOT_SUPPORTED";
  constructor(message: string) {
    super(message);
    this.name = "CapabilityError";
  }
}
