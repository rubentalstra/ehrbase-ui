// Authenticated encryption-at-rest for ephemeral PHI held OUTSIDE EHRbase —
// today the draft autosave (§7 / Tranche 1d), where in-progress composition
// form-state lives in Valkey before commit. EHRbase is the system of record;
// anything PHI we stage elsewhere is encrypted.
//
// Uses the @noble suite (Cure53-audited, zero-dependency) end-to-end — no
// node:crypto in this module. XChaCha20-Poly1305 AEAD via `managedNonce`, which
// generates a fresh 192-bit random nonce per message and prepends it to the
// ciphertext. We do NOT hand-manage nonces, tags, or tag lengths — the
// misuse-resistant API removes that whole class of footgun. The "don't roll your
// own crypto" rule applies doubly to PHI.
//
// The 32-byte key is derived from DRAFT_ENCRYPTION_SECRET via HKDF-SHA256 with a
// domain-separation salt + info. A dedicated secret keeps draft-at-rest
// encryption decoupled from any other application secret — one secret to rotate.
//
// `.server.ts` (CLAUDE.md rule 7): never reaches the client bundle.

import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { managedNonce } from "@noble/ciphers/utils.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

const KEY_INFO = "ehrbase-ui:at-rest-encryption:v1";
// Fixed, non-secret application salt (RFC 5869 §3.1 — a non-empty salt is
// preferred even when the IKM is high-entropy). Bump the suffix to rotate.
const KEY_SALT = "ehrbase-ui:at-rest-salt:v1";

function derivedKey(): Uint8Array {
  const secret = process.env.DRAFT_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error("DRAFT_ENCRYPTION_SECRET is not set — cannot encrypt PHI at rest.");
  }
  // HKDF-SHA256(ikm=secret, salt=KEY_SALT, info=KEY_INFO) → 32-byte XChaCha key.
  const enc = new TextEncoder();
  return hkdf(sha256, enc.encode(secret), enc.encode(KEY_SALT), enc.encode(KEY_INFO), 32);
}

// managedNonce(xchacha20poly1305)(key) → { encrypt, decrypt }; encrypt prepends a
// random nonce, decrypt strips it. Key is re-derived per call (cheap; keeps no
// key material resident).
function aead() {
  return managedNonce(xchacha20poly1305)(derivedKey());
}

/** Encrypt a UTF-8 string → base64 of (nonce ‖ ciphertext ‖ Poly1305 tag). */
export function encryptString(plaintext: string): string {
  const sealed = aead().encrypt(new TextEncoder().encode(plaintext));
  return Buffer.from(sealed).toString("base64");
}

/** Reverse encryptString. Throws if the payload is malformed or the tag fails. */
export function decryptString(envelope: string): string {
  const opened = aead().decrypt(Uint8Array.from(Buffer.from(envelope, "base64")));
  return new TextDecoder().decode(opened);
}
