# ADR-0027 — Audit cold-storage abstraction: SeaweedFS best-effort default + AWS S3 WORM

- **Status:** Accepted
- **Date:** 2026-05-28
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

Architecture-doc §14.6 calls for an S3-compatible cold tier with **WORM Object Lock** for the audit log. The warm tier is the Postgres `audit_events` table (ADR-0013) — append-only at the storage layer, with the hash chain (§14.5) as the second integrity layer. The cold tier is the long-horizon archive (5–20+ years per the deployment's national retention law, §14.7) and the post-purge resting place for events past their warm-tier retention.

Two design questions: what's the **interface**, and what's the **default provider** for the open-source self-host dev stack?

Provider options considered (verified 2026-05-28):

- **AWS S3.** Real Object Lock in COMPLIANCE mode. The reference WORM implementation. Cloud-only — not acceptable as the open-source dev default.
- **MinIO.** Was the obvious open-source S3-compatible default. The MinIO open-source repository was archived on 2026-04-25 (community-edition removal) — no longer a viable forward-looking default.
- **SeaweedFS** (Apache 2.0, release 4.29 on 2026-05-26). Actively maintained, ships in Docker, exposes the S3 API including the Object Lock API surface. **But:** issue [seaweedfs#8350](https://github.com/seaweedfs/seaweedfs/issues/8350) — "Object Lock COMPLIANCE mode does not enforce WORM (Delete still succeeds)" — closed as **"not planned"** on 2026-02-18 against v4.12. So SeaweedFS accepts the PutObjectRetention call (the API surface works end-to-end) but does not actually block deletes. Suitable as a **durable archive** but **not** as a regulatory-grade WORM tier.
- **Ceph RGW.** Full Object Lock support. Heavy ops (≥3 nodes / 16+ GB RAM each); not realistic as a dev-default sidecar.
- **Garage.** Explicitly does not support Object Lock — declined.
- **RustFS** (Apache 2.0). Active project but currently alpha — too unstable to commit to.

## Decision

**Define a `ColdStorageProvider` interface in code with two shipped implementations and a no-op variant.** Be honest about the regulatory-WORM gap in the dev default.

**Interface** (`src/lib/audit/cold-store.server.ts`):

```ts
export interface ColdStorageProvider {
  readonly mode: 'best-effort' | 'worm-compliance'
  archive(event: AuditEventRow): Promise<string> // returns the object key
  verify(eventId: string, key: string): Promise<boolean>
}
```

**Two implementations, both backed by `@aws-sdk/client-s3`:**

- **`SeaweedFsColdStore`** (`mode: 'best-effort'`). Uses `endpoint` + `forcePathStyle: true`. Sets Object Lock COMPLIANCE + a `RetainUntilDate` derived from the event's timestamp + the per-policy retention period — the API surface is exercised end-to-end, so a future SeaweedFS that ships real WORM enforcement works without code changes. **The dev `docker-compose.yml` default.**
- **`S3ColdStore`** (`mode: 'worm-compliance'`). Uses AWS region + SigV4. Same Object Lock COMPLIANCE + `RetainUntilDate`. **The production WORM-compliant alternative.**

**No-op variant** for unit tests + ad-hoc dev: `COLD_STORAGE_PROVIDER=none` returns a provider that logs "would have archived `<eventId>`" and `verify` returns `true`. Never used in deployments that have any compliance requirement.

**Object layout.** Key = `audit/<yyyy>/<mm>/<dd>/<eventId>.json`. Body = the canonical JSON form of the event row (`canonicalize()` from `src/lib/audit/hash-chain.server.ts`) — same canonical form that drove the hash chain, so a restored cold object can be hash-verified against the chain.

**Selection.** `src/lib/audit/cold-store.factory.server.ts` reads `COLD_STORAGE_PROVIDER` (`seaweedfs` / `aws` / `none`) and returns the appropriate instance. On boot the factory logs `cold-tier mode: <best-effort|worm-compliance>` so the deployment sees, in a deterministic place, which compliance regime is in play.

**Authoritative immutability layer.** This ADR explicitly states: the warm Postgres tier with the ADR-0013 append-only trigger is the **authoritative immutability layer for v1.0**. The cold tier is durable archive that becomes regulatory-grade WORM only when paired with AWS S3 or (future) Ceph RGW. The DPIA template wording reflects this; deployments choosing the SeaweedFS dev default for production are documented as accepting that gap.

## Consequences

**Positive.** Open-source self-host stays Docker-only by default. The same code path (`@aws-sdk/client-s3` + path-style override) covers both providers, so AWS S3 deployments share the integration tests of the dev stack. The interface keeps Ceph RGW + future providers (RustFS once stable) trivial to add.

**Negative.** The dev default is honest about a known gap — SeaweedFS COMPLIANCE-mode delete still succeeds (issue #8350). Mitigation: the warm tier is the authoritative layer; the gap is explicitly named in the DPIA, the DPA, the deployment guide, and a `cold-store-worm-gap.test.ts` that ASSERTS the delete succeeds so the test breaks loudly if SeaweedFS ever fixes #8350 and we want to re-evaluate the default.

**Tradeoff vs. a third-party cloud-only default (e.g. AWS S3 even for dev).** A cloud-only dev default would push every contributor to set up AWS credentials before running the stack — friction that contradicts the open-source posture. Accepted.

## Verification

- Provider-factory unit tests cover every env-driven branch + the no-op default.
- Cold-store integration test (gated `E2E_FULL_STACK=1` with the SeaweedFS sidecar) archives + retrieves + verifies a synthetic event.
- The boot-log `cold-tier mode: <...>` line is asserted-against in a quick unit test so a future env-var rename doesn't silently degrade the visibility.
- `cold-store-worm-gap.test.ts` writes to SeaweedFS in COMPLIANCE mode, attempts delete, ASSERTS the delete succeeds (the documented gap). If this test ever fails, SeaweedFS may have fixed #8350 — reopen the ADR.
