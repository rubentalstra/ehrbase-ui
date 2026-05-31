// Typed errors the terminology adapters throw; the server-fn layer maps each to
// a stable code. Terminology data is NOT PHI (ADR-0034), so messages may name a
// code system / value-set URL — but the shared vocabulary keeps the server-fn
// surface uniform across adapters.

export class TerminologyValidationError extends Error {
  readonly code = "VALIDATION";
  constructor(message: string) {
    super(message);
    this.name = "TerminologyValidationError";
  }
}

/** The terminology server responded but the operation is unsupported / refused. */
export class TerminologyServerError extends Error {
  readonly code = "UPSTREAM_ERROR";
  // Accepts ErrorOptions so the originating fetch/HTTP failure is preserved as
  // `cause` for incident triage.
  constructor(message = "the terminology server returned an error", options?: ErrorOptions) {
    super(message, options);
    this.name = "TerminologyServerError";
  }
}

/** A capability-gated op was attempted on a provider that does not advertise it. */
export class TerminologyCapabilityError extends Error {
  readonly code = "NOT_SUPPORTED";
  constructor(message: string) {
    super(message);
    this.name = "TerminologyCapabilityError";
  }
}
