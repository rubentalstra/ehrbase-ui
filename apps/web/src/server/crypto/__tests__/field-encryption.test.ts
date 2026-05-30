import { beforeAll, describe, expect, it } from "vitest";

import { decryptString, encryptString } from "../field-encryption.server.ts";

beforeAll(() => {
  process.env.AUDIT_PSEUDONYM_SECRET = "test-secret-for-field-encryption-rounds";
});

describe("field-encryption (XChaCha20-Poly1305 AEAD at rest)", () => {
  it("round-trips a UTF-8 payload", () => {
    const plaintext = JSON.stringify({ bp: { systolic: 140 }, note: "café — 北京" });
    expect(decryptString(encryptString(plaintext))).toBe(plaintext);
  });

  it("produces a fresh nonce each time (no deterministic ciphertext)", () => {
    const a = encryptString("same");
    const b = encryptString("same");
    expect(a).not.toBe(b);
    expect(decryptString(a)).toBe("same");
    expect(decryptString(b)).toBe("same");
  });

  it("does not leak plaintext into the envelope", () => {
    const envelope = encryptString("super-secret-bsn-999990123");
    expect(envelope).not.toContain("999990123");
  });

  it("rejects a tampered ciphertext (Poly1305 tag fails)", () => {
    const bytes = Buffer.from(encryptString("payload"), "base64");
    // Flip a byte well past the 24-byte nonce, inside the ciphertext/tag region.
    const i = bytes.length - 2;
    bytes[i] = (bytes[i] ?? 0) ^ 0xff;
    expect(() => decryptString(bytes.toString("base64"))).toThrow();
  });
});
