// @ehrbase-ui/demographic-core/identifier — the national-ID registry + pure
// checksum validators. CLIENT-SAFE: no I/O, no secrets. The server-only
// pseudonymize helper lives in pseudonymize.server.ts (imported via the
// package's "./pseudonymize" subpath), kept out of this barrel so node:crypto +
// the secret never reach a client bundle.

export * from "./validators.ts";
export * from "./registry.ts";
