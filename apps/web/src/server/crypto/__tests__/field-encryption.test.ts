import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { decryptString, encryptString } from "../field-encryption.server.ts";

const EnvSchema = z.object({ v: z.number(), iv: z.string(), tag: z.string(), ct: z.string() });

beforeAll(() => {
  process.env.AUDIT_PSEUDONYM_SECRET = "test-secret-for-field-encryption-rounds";
});

describe("field-encryption (AES-256-GCM at rest)", () => {
  it("round-trips a UTF-8 payload", () => {
    const plaintext = JSON.stringify({ bp: { systolic: 140 }, note: "café — 北京" });
    expect(decryptString(encryptString(plaintext))).toBe(plaintext);
  });

  it("produces a fresh IV each time (no deterministic ciphertext)", () => {
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

  it("rejects a tampered ciphertext (auth tag fails)", () => {
    const env = EnvSchema.parse(JSON.parse(encryptString("payload")));
    const flipped = Buffer.from(env.ct, "base64");
    flipped[0] = (flipped[0] ?? 0) ^ 0xff;
    const tampered = JSON.stringify({ ...env, ct: flipped.toString("base64") });
    expect(() => decryptString(tampered)).toThrow();
  });
});
