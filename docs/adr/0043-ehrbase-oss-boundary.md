# ADR-0043 — EHRbase 2.x open-source boundary + app-layer responsibilities

- **Status:** Accepted
- **Date:** 2026-05-31
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

We build an **open-source** EPD on EHRbase **2.31.0** (Apache-2.0). EHRbase also exists as a
commercial product (**HIP EHRbase** / vitagroup) with enterprise-only features, and the 1.x→2.x
rewrite **removed** some capabilities that older docs + the 1.x codebase still describe. To avoid
designing against a feature that isn't in our tier, we map the boundary explicitly. Verified
2026-05-31 against `docs.ehrbase.org` and the `ehrbase/ehrbase` source trees; the human-readable
matrix lives in `docs/EHRBASE-CAPABILITIES.md`.

## Decision

**Build only against open-source EHRbase 2.x capabilities. Implement every gap at the
application/BFF layer in open source.**

**In OSS 2.x (we rely on):** full openEHR REST (EHR / EHR_STATUS / Composition / Versioned\* /
Contribution / Directory / Query / Definition / ADL 1.4 OPT + Web Template + FLAT); ad-hoc + stored
AQL; `CONTRIBUTION` / `AUDIT_DETAILS` / `ATTESTATION` (commit lineage only); OAuth2/Keycloak RBAC
(coarse USER/ADMIN); the **pf4j plugin framework**; the Admin API (dev-only — hard-deletes bypass
versioning); Actuator health/metrics/prometheus; the experimental **Item-Tag API**; external
**FHIR terminology** validation (FHIR-only, matches ADR-0034); Redis/Valkey cache.

**NOT in OSS 2.x → our responsibility:**

| Gap                                              | Status                                                           | Our open-source workaround                                                                            |
| ------------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| ATNA read-access audit                           | OSS in 1.x, **removed in 2.x**; HIP commercial                   | IHE ATNA emitted from the BFF (ADR-0041, M9)                                                          |
| ABAC / data-level access control                 | OSS in 1.x, **removed in 2.x**; HIP positions enterprise control | Care-relationship gate enforced in the BFF (ADR-0041, M9)                                             |
| Event trigger / change notification              | HIP commercial                                                   | AQL polling on a version/timestamp cursor (messaging/lab-alerts, M23); real-time stays v1.x           |
| Multi-tenancy                                    | HIP commercial                                                   | One EHRbase instance per tenant, or org-scoped filtering in the BFF                                   |
| EHR-level Merge (move compositions between EHRs) | HIP commercial                                                   | Not needed — our patient-merge is _demographic-party_ merge in our own DB (M7); a patient has one EHR |
| Maintained FHIR Bridge                           | `ehrbase/fhir-bridge` **archived**                               | FHIR is our own adapter layer (ADR-0033)                                                              |

**Operational rules that follow:**

- **Deletes use logical openEHR versioning** (a new version with `change_type = deleted`), never the
  Admin API hard-delete (dev-only; bypasses versioning and is not for production).
- **Committer derivation** is from the forwarded Keycloak token; we never send `openEHR-COMMITTER-*`
  headers (EHRbase 2.31 ignores them — ADR-0041).
- Build/run requires **Java 25**; database is PostgreSQL ≥15 (we pin 18.4); two EHRbase schemas
  (`ehr` + `ext`). Watch EHRbase `UPDATING.md` for boundary drift on upgrade.

## Consequences

**Positive.** No accidental dependence on a commercial or removed feature; clear, documented
ownership of audit, access control, and change-notification at the app layer (consistent with the
BFF pattern, ADR-0002). The whole stack stays Apache-2.0 / inspectable.

**Negative.** We carry app-layer implementations of things a commercial CDR would provide turnkey
(audit, fine-grained access control, notifications). This is the deliberate cost of an open-source
EPD and is reflected in the milestone plan (M9 owns audit + access control; M23 owns
notification-by-polling).
