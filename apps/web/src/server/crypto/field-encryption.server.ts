// AES-256-GCM encryption-at-rest for ephemeral PHI held OUTSIDE EHRbase — today
// the draft autosave (§7 / Tranche 1d), where in-progress composition form-state
// lives in Valkey before commit. EHRbase is the system of record; anything PHI
// we stage elsewhere is encrypted.
//
// The key is derived from AUDIT_PSEUDONYM_SECRET via HKDF-SHA256 with a
// domain-separation `info` string, so it is cryptographically independent from
// the audit-pseudonymization HMAC use of the same secret (§14.4) — one secret to
// rotate, no key reuse across purposes.
//
// `.server.ts` (CLAUDE.md rule 7): never reaches the client bundle.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

import { z } from "zod";

const KEY_INFO = "ehrbase-ui:at-rest-encryption:v1";
// Fixed, non-secret application salt (RFC 5869 §3.1 — a non-empty salt is
// preferred even when the IKM is already high-entropy). Stable so the derived
// key is reproducible across restarts; bump the suffix to rotate.
const KEY_SALT = "ehrbase-ui:at-rest-salt:v1";
const ALGORITHM = "aes-256-gcm";

function derivedKey(): Buffer {
  const secret = process.env.AUDIT_PSEUDONYM_SECRET;
  if (!secret) {
    throw new Error("AUDIT_PSEUDONYM_SECRET is not set — cannot encrypt PHI at rest.");
  }
  // HKDF-SHA256(ikm=secret, salt=KEY_SALT, info=KEY_INFO) → 32-byte AES-256 key.
  return Buffer.from(hkdfSync("sha256", secret, KEY_SALT, KEY_INFO, 32));
}

const EnvelopeSchema = z.object({
  v: z.literal(1),
  iv: z.string(),
  tag: z.string(),
  ct: z.string(),
});

/** Encrypt a UTF-8 string into a self-describing JSON envelope (v/iv/tag/ct, base64). */
export function encryptString(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, derivedKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ct: ct.toString("base64"),
  });
}

/** Reverse encryptString. Throws if the envelope is malformed or the auth tag fails. */
export function decryptString(envelope: string): string {
  const env = EnvelopeSchema.parse(JSON.parse(envelope));
  const decipher = createDecipheriv(ALGORITHM, derivedKey(), Buffer.from(env.iv, "base64"));
  decipher.setAuthTag(Buffer.from(env.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(env.ct, "base64")), decipher.final()]).toString("utf8");
}
