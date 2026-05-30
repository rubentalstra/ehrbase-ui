// National patient-identifier checksum validators (ADR-0031 identifier registry).
// Each returns true iff `value` is structurally valid AND passes its checksum
// (where the scheme defines one). Format-only schemes are validated for shape;
// opaque schemes (MRN) accept any non-empty string.
//
// Pure functions — no I/O, no PHI retention. Tested with published vectors.

const digits = (v: string): number[] => v.split("").map((c) => c.charCodeAt(0) - 48);

/** Luhn (mod-10) check digit for a numeric payload string. */
function luhnCheckDigit(payload: string): number {
  let sum = 0;
  let double = true; // payload is the value WITHOUT its check digit; rightmost doubles
  for (let i = payload.length - 1; i >= 0; i--) {
    let n = payload.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return (10 - (sum % 10)) % 10;
}

/** NL — Burgerservicenummer: 9 digits, "11-proef" (weights 9..2,-1, sum ≡ 0 mod 11). */
export function isValidBsn(value: string): boolean {
  if (!/^\d{9}$/.test(value) || value === "000000000") return false;
  const d = digits(value);
  const weights = [9, 8, 7, 6, 5, 4, 3, 2, -1];
  const sum = d.reduce((acc, n, i) => acc + n * (weights[i] ?? 0), 0);
  return sum % 11 === 0;
}

/** PL — PESEL: 11 digits, weighted mod-10 check digit. */
export function isValidPesel(value: string): boolean {
  if (!/^\d{11}$/.test(value)) return false;
  const d = digits(value);
  const weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  const sum = weights.reduce((acc, w, i) => acc + w * (d[i] ?? 0), 0);
  const check = (10 - (sum % 10)) % 10;
  return check === d[10];
}

/** FR — NIR/INSEE: 13-digit body + 2-digit key = 97 − (body mod 97). Corsica 2A→19, 2B→18. */
export function isValidNir(value: string): boolean {
  const v = value.replace(/\s/gu, "").toUpperCase();
  if (!/^[0-9AB]{13}\d{2}$/u.test(v)) return false;
  const body = v.slice(0, 13).replace("2A", "19").replace("2B", "18");
  const key = v.slice(13);
  if (!/^\d{13}$/u.test(body)) return false;
  return 97 - (Number(body) % 97) === Number(key);
}

/** BE — Rijksregisternummer (NISS): 11 digits; check = 97 − (base mod 97), pre/post-2000. */
export function isValidNiss(value: string): boolean {
  if (!/^\d{11}$/u.test(value)) return false;
  const base = Number(value.slice(0, 9));
  const check = Number(value.slice(9));
  const mod97 = (n: number): number => 97 - (n % 97);
  return mod97(base) === check || mod97(2_000_000_000 + base) === check;
}

/** DE — Krankenversichertennummer (KVNR): letter + 8 digits + Luhn check digit. */
export function isValidKvnr(value: string): boolean {
  if (!/^[A-Z]\d{9}$/u.test(value)) return false;
  const letterValue = value.charCodeAt(0) - 64; // A=1 … Z=26
  const payload = String(letterValue).padStart(2, "0") + value.slice(1, 9);
  return luhnCheckDigit(payload) === value.charCodeAt(9) - 48;
}

/** IT — Codice Fiscale: 16-char structural format (full odd/even checksum is a v1.x refinement). */
export function isValidCodiceFiscaleFormat(value: string): boolean {
  return /^[A-Z]{6}\d{2}[A-EHLMPR-T]\d{2}[A-Z]\d{3}[A-Z]$/u.test(value.toUpperCase());
}

/** ES — DNI/NIE: 8-digit (or X/Y/Z + 7-digit) body + mod-23 control letter. */
export function isValidSpanishId(value: string): boolean {
  const m = /^([XYZ]?)(\d{7,8})([A-Z])$/u.exec(value.toUpperCase());
  if (!m) return false;
  const prefix = m[1] ?? "";
  const lead = prefix === "X" ? "0" : prefix === "Y" ? "1" : prefix === "Z" ? "2" : "";
  const n = Number(lead + (m[2] ?? ""));
  return "TRWAGMYFPDXBNJZSQVHLCKE"[n % 23] === m[3];
}

/** PT — NIF: 9 digits, weighted mod-11 control digit. */
export function isValidNif(value: string): boolean {
  if (!/^\d{9}$/u.test(value)) return false;
  const d = digits(value);
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += (d[i] ?? 0) * (9 - i);
  const rem = 11 - (sum % 11);
  const check = rem >= 10 ? 0 : rem;
  return check === d[8];
}

/** A non-empty opaque identifier (hospital MRN and other deployment-local schemes). */
export function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}
