// Provider-agnostic pseudonymization (ADR-0031; architecture.md §14.4).
//
// HMAC-SHA256 of a national patient identifier (or EHR subject id) keyed by
// AUDIT_PSEUDONYM_SECRET. This MUST stay byte-for-byte identical to
// apps/web/src/server/audit/pseudonymize.ts — both are
// HMAC-SHA256(value, secret) → lowercase hex — so the same patient correlates
// across the audit DB, the demographic store, and the EHRbase subject ref by a
// plain SQL join, never a re-hash (ADR-0024). node:crypto (OpenSSL) is the right
// tool for this keyed-hash primitive; it is not cipher construction.
//
// `.server.ts`: server-only (reads the secret from env) — never reaches the client.

import { createHmac } from "node:crypto";

function secret(): string {
  const s = process.env.AUDIT_PSEUDONYM_SECRET;
  if (!s) {
    throw new Error("AUDIT_PSEUDONYM_SECRET is not set — cannot pseudonymize identifiers (§14.4).");
  }
  return s;
}

/** Deterministic, irreversible pseudonym: HMAC-SHA256(value, secret) as hex. */
export function pseudonymizeIdentifier(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex");
}
