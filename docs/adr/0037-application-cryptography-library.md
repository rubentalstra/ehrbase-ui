# ADR-0037 — Application cryptography uses the @noble suite (node:crypto avoided in new code)

- **Status:** Accepted
- **Date:** 2026-05-30
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

Architecture-doc reference: §13 (security), §14.4 (pseudonymisation), §15. The codebase reached for raw `node:crypto` for at-rest encryption (AES-256-GCM) in M6. A Semgrep alert (`javascript.node-crypto.security.gcm-no-tag-length`) flagged the hand-managed GCM construction — exactly the "don't roll your own cipher mode" footgun (manual IV / auth-tag / tag-length handling). For a PHI system we want a single, **audited, misuse-resistant, zero-dependency** crypto vocabulary rather than hand-assembled OpenSSL primitives scattered across modules.

The [@noble suite](https://github.com/paulmillr/noble-ciphers) (`@noble/ciphers`, `@noble/hashes`) is the de-facto modern JS/TS choice: Cure53-audited (ciphers v1.0.0 Sept 2024 + self-audit v2.2.0 Apr 2026; hashes audited), zero-dependency, pure-JS (no native build, no WASM async-init), synchronous, and **misuse-resistant** (`managedNonce` handles nonces; no tag-length footgun).

A hard constraint: cryptographic **output must not change** for data already at rest or in the audit hash-chain. Verified empirically that `@noble/hashes` HMAC-SHA256 is **byte-for-byte identical** to OpenSSL/`node:crypto` for the same `(key, message)` — and SHA-256 is likewise deterministic across implementations. So a migration preserves the §14.4 cross-store pseudonym correlation (ADR-0024) and the §14 hash-chain verification.

## Decision

**All application cryptography in new code uses the @noble suite. `node:crypto` is not used in new code.**

| Need | Use |
| --- | --- |
| Authenticated encryption at rest | `@noble/ciphers` — XChaCha20-Poly1305 AEAD via `managedNonce` (ADR — field-encryption) |
| Hashing (SHA-256), HMAC, HKDF | `@noble/hashes` — `sha256`, `hmac`, `hkdf` |
| CSPRNG / random bytes | Web Crypto global `crypto.getRandomValues` (platform standard; not `node:crypto`) |
| UUID v4 | Web Crypto global `crypto.randomUUID()` |

- **Misuse-resistance over primitives.** No hand-managed IVs / auth tags / tag-lengths. The AEAD nonce is managed; this is what removed the Semgrep GCM finding.
- **Output parity is mandatory.** `@noble` HMAC-SHA256 / SHA-256 are byte-identical to OpenSSL, so migrating an existing hash/HMAC site does **not** change stored pseudonyms or chain hashes. Every migration of an existing site ships with a parity test pinning the canonical vector (e.g. `demographic-core` pins the HMAC vector that equals the §14.4 audit pseudonym).
- **Pins (exact, MIT):** `@noble/ciphers` 2.2.0, `@noble/hashes` 2.2.0.

**Existing `node:crypto` sites (M2/M6) are migrated in a dedicated follow-up PR**, not silently left split, each gated by a parity test:

| Site | Current | Target |
| --- | --- | --- |
| `field-encryption.server.ts` | ✅ already `@noble` | done |
| `demographic-core/.../pseudonymize.server.ts` | ✅ `@noble/hashes` hmac | done (this ADR) |
| `audit/pseudonymize.ts` (§14.4) | `node:crypto` createHmac | `@noble/hashes` hmac (parity-pinned) |
| `audit/hash-chain.ts` (§14) | `node:crypto` createHash | `@noble/hashes` sha256 (parity-pinned; chain re-verifies) |
| `functions/upload.server.ts` | `node:crypto` createHash | `@noble/hashes` sha256 |
| `bff/csrf.ts`, `bff/security-headers.ts` | `node:crypto` randomBytes | `crypto.getRandomValues` |
| `$.ts`, `audit/logger.ts`, `audit/task-lock.ts`, `audit/integrity-job.ts`, `auth/sso-bootstrap.ts` | `node:crypto` randomUUID | `crypto.randomUUID()` |

## Consequences

**Positive.** One audited crypto vocabulary; misuse-resistant APIs remove a whole class of footgun; pure-JS + zero-dep keeps the supply chain and bundle small and the same across environments; `node:crypto` leaves the crypto-logic dependency surface entirely once the follow-up lands.

**Negative.** (a) Pure-JS hashing is slower than native OpenSSL — negligible for our payloads (audit lines, identifiers, drafts); the one large case (≤50 MB upload SHA-256) is acceptable and re-measured if it ever matters. (b) The hash-chain migration must be parity-gated so existing chains keep verifying — a real test obligation, not optional. (c) Two `@noble` packages to keep version-pinned.

**Trade-off vs keeping `node:crypto` for primitives.** Rejected for *consistency + auditability*: while OpenSSL HMAC/SHA are perfectly correct, a single audited library with one idiom is easier to reason about and review than primitives split across two libraries. The decisive driver remains the cipher-construction footgun, which `@noble` + `managedNonce` eliminates.

## Verification

- `demographic-core` pseudonymize pins `HMAC-SHA256("999990123", "<test secret>") = 3bd2…1aaa`, proving `@noble` == OpenSSL output (cross-store parity, ADR-0024).
- After the follow-up PR: `grep -rE "from ['\"]node:crypto['\"]" apps packages --include=*.ts` returns nothing outside tests; audit hash-chain integrity job still verifies pre-migration chains; Semgrep `node-crypto` rules report no findings.
