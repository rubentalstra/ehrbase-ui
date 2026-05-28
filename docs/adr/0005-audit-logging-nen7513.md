# ADR-0005 — Audit logging shape (EU healthcare audit write path, NEN 7513 schema)

- **Status:** Accepted
- **Date:** 2026-05-27
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

Architecture-doc reference: §14. The audit **write path** is ratified now, in
Milestone 2, because two M2 features depend on it: break-glass (§5.6) must
write a real `EMERGENCY_ACCESS_GRANTED` event, and the BFF proxy must audit
every PHI call. The broader §14 **governance** chapter (cold S3-Object-Lock
tier, configurable retention + purge job, DPIA/DPA/RoPA, the audit-review
dashboard, the patient-facing Art.15 access log) is a later, dedicated
milestone — this is sequencing, not deferral; the write path is 100% complete.

**Why NEN 7513 as the schema (for an EU-wide deployment).** NEN 7513:2024 is a
Dutch national standard, but it's the most comprehensive published
healthcare-audit-log schema we evaluated — every WHO/WHAT/WHERE/WHY/WHEN field
labelled and typed. It is a strict superset of what GDPR Art. 32 + ISO 27799
require, so a deployment in any EU member state we've checked satisfies both
the EU baseline and its national audit-log requirements by using this schema.
NL deployments get the bonus of being pre-aligned with national certification.
Picking a single comprehensive schema once, rather than a per-country schema,
keeps the code path uniform and the test surface manageable.

## Decision

Every PHI-touching server function and the BFF proxy call a single
`logAudit()` helper. It validates against the §14.2 schema, pseudonymizes
subject identifiers via HMAC-SHA256 (§14.4), chains each event to the previous
via SHA-256 (§14.5), and persists to three sinks:

1. the append-only `audit` database (source of truth, ADR-0013),
2. the Valkey chain head (`audit:lastHash`), and
3. a redundant NDJSON file on a persistent volume (log-shipper source).

`logAudit` is fire-and-forget for latency but never lossy: the DB write is
awaited inside a serialized critical section, and any failure falls through to
stderr. The record schema is **derived from the Drizzle table** (ADR-0012) so
schema and storage cannot drift.

## Consequences

**Positive:** tamper-evident, schema-validated, redundantly durable audit from
day one of any PHI access; break-glass is genuinely recorded, not stubbed.
**Negative:** the audit DB is a hard dependency of any PHI-capable path; the
in-process chain serialization assumes a single app instance per chain (cross-
instance ordering is a governance-milestone concern).
