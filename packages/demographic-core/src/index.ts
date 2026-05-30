// @ehrbase-ui/demographic-core — pluggable demographic provider (ADR-0031,
// supersedes ADR-0023 in shape). The DemographicProvider interface + canonical
// types every adapter speaks, the national-ID registry, and the built-in
// Postgres adapter (./builtin).
//
// Server-only pseudonymize is exposed at "@ehrbase-ui/demographic-core/pseudonymize"
// (kept out of this barrel so node:crypto + the secret never reach a client bundle).

export * from "./provider.ts";
export * from "./audit.ts";
export * from "./errors.ts";
export * from "./identifier/index.ts";
