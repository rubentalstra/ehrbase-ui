import { beforeAll, describe, expect, it } from "vitest";

import { pseudonymizeIdentifier } from "../pseudonymize.server.ts";
import { getNamespace, IDENTIFIER_NAMESPACES, validateIdentifier } from "../registry.ts";
import {
  isValidBsn,
  isValidCodiceFiscaleFormat,
  isValidKvnr,
  isValidNif,
  isValidNir,
  isValidNiss,
  isValidPesel,
  isValidSpanishId,
} from "../validators.ts";

describe("national-ID checksum validators", () => {
  it("NL BSN 11-proef", () => {
    expect(isValidBsn("111222333")).toBe(true);
    expect(isValidBsn("111222334")).toBe(false);
    expect(isValidBsn("000000000")).toBe(false);
    expect(isValidBsn("12345")).toBe(false);
  });

  it("PL PESEL", () => {
    expect(isValidPesel("44051401359")).toBe(true);
    expect(isValidPesel("44051401358")).toBe(false);
    expect(isValidPesel("4405140135")).toBe(false);
  });

  it("BE NISS", () => {
    expect(isValidNiss("85073003328")).toBe(true);
    expect(isValidNiss("85073003329")).toBe(false);
  });

  it("DE KVNR (Luhn)", () => {
    expect(isValidKvnr("A123456780")).toBe(true);
    expect(isValidKvnr("A123456781")).toBe(false);
    expect(isValidKvnr("1234567890")).toBe(false); // must start with a letter
  });

  it("ES DNI/NIE (mod-23 letter)", () => {
    expect(isValidSpanishId("12345678Z")).toBe(true);
    expect(isValidSpanishId("12345678A")).toBe(false);
    expect(isValidSpanishId("X1234567L")).toBe(true);
  });

  it("PT NIF (mod-11)", () => {
    expect(isValidNif("501442600")).toBe(true);
    expect(isValidNif("501442601")).toBe(false);
  });

  it("FR NIR (mod-97 key, incl. Corsica substitution)", () => {
    // Build a valid body+key with the same mod-97 rule, then assert a wrong key fails.
    const body = "1840175123456";
    const key = String(97 - (Number(body) % 97)).padStart(2, "0");
    expect(isValidNir(body + key)).toBe(true);
    expect(isValidNir(body + "00")).toBe(false);
    expect(isValidNir("2A0" + body.slice(3) + key)).toBe(false); // wrong key after Corsica sub
  });

  it("IT Codice Fiscale (structural format)", () => {
    expect(isValidCodiceFiscaleFormat("RSSMRA85T10A562S")).toBe(true);
    expect(isValidCodiceFiscaleFormat("not-a-cf")).toBe(false);
  });
});

describe("identifier registry", () => {
  it("registers all ten namespaces with a system URI + validator", () => {
    expect(Object.keys(IDENTIFIER_NAMESPACES)).toHaveLength(10);
    for (const ns of Object.values(IDENTIFIER_NAMESPACES)) {
      expect(ns.system).toMatch(/^(https?:|urn:)/u);
      expect(typeof ns.validate).toBe("function");
    }
  });

  it("validateIdentifier uses the namespace validator when known", () => {
    expect(validateIdentifier("nl-bsn", "111222333")).toEqual({ valid: true, known: true });
    expect(validateIdentifier("nl-bsn", "111222334")).toEqual({ valid: false, known: true });
  });

  it("treats an unknown namespace as opaque (non-empty)", () => {
    expect(validateIdentifier("xx-local", "anything")).toEqual({ valid: true, known: false });
    expect(validateIdentifier("xx-local", "  ")).toEqual({ valid: false, known: false });
  });

  it("MRN is opaque (any non-empty value)", () => {
    expect(getNamespace("mrn")?.validate("MRN-001")).toBe(true);
    expect(getNamespace("mrn")?.validate("")).toBe(false);
  });
});

describe("pseudonymizeIdentifier", () => {
  beforeAll(() => {
    process.env.AUDIT_PSEUDONYM_SECRET = "test-secret-for-demographic-pseudonymize";
  });

  it("is deterministic, 64-hex, irreversible, and collision-distinct", () => {
    const a = pseudonymizeIdentifier("999990123");
    expect(a).toBe(pseudonymizeIdentifier("999990123"));
    expect(a).toMatch(/^[0-9a-f]{64}$/u);
    expect(a).not.toContain("999990123");
    expect(a).not.toBe(pseudonymizeIdentifier("999990124"));
  });

  it("matches the canonical HMAC-SHA256 vector (cross-store parity with §14.4)", () => {
    // Pinned: @noble HMAC-SHA256 == OpenSSL HMAC-SHA256 for this (secret, value),
    // so the demographic pseudonym equals the audit-DB pseudonym byte-for-byte.
    expect(pseudonymizeIdentifier("999990123")).toBe(
      "3bd201488fcdb18261ac01956e3d0367344f7ef290848da579cf5c358d101aaa",
    );
  });
});
