// Provider-agnostic pseudonymization (ADR-0031; architecture.md §14.4; crypto
// policy ADR-0037).
//
// HMAC-SHA256 of a national patient identifier (or EHR subject id) keyed by
// AUDIT_PSEUDONYM_SECRET, via @noble/hashes (Cure53-audited) — no node:crypto.
// The output is byte-for-byte identical to a standard OpenSSL HMAC-SHA256, so it
// matches apps/web/src/server/audit/pseudonymize.ts: the same patient correlates
// across the audit DB, the demographic store, and the EHRbase subject ref by a
// plain SQL join, never a re-hash (ADR-0024).
//
// `.server.ts`: server-only (reads the secret from env) — never reaches the client.

import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

function secretBytes(): Uint8Array {
  const s = process.env.AUDIT_PSEUDONYM_SECRET;
  if (!s) {
    throw new Error("AUDIT_PSEUDONYM_SECRET is not set — cannot pseudonymize identifiers (§14.4).");
  }
  return new TextEncoder().encode(s);
}

/** Deterministic, irreversible pseudonym: HMAC-SHA256(value, secret) as lowercase hex. */
export function pseudonymizeIdentifier(value: string): string {
  return bytesToHex(hmac(sha256, secretBytes(), new TextEncoder().encode(value)));
}
