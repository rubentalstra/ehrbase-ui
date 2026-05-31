# ADR-0041 — Audit + access governance: openEHR-native lineage + IHE-ATNA-from-BFF + BFF access control

- **Status:** Accepted
- **Date:** 2026-05-31
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** ADR-0024 (the removed bespoke NEN-7513 hash-chain subsystem)
- **Superseded by:** —

## Context

The 2026-05-30 core-refocus removed the bespoke NEN-7513 audit subsystem (`logAudit`, hash chain,
pseudonymize, retention, cold-store) and its ADR-0024 (the file no longer exists; dangling
references remain across the docs and sub-agents). The audit question was then re-opened to ground
it in what the openEHR + EHRbase standard actually provides. Research (planning session 2026-05-31,
verified against the openEHR RM spec, docs.ehrbase.org, and the EHRbase source trees):

1. **openEHR audits writes only.** Every commit produces a `CONTRIBUTION` with `AUDIT_DETAILS`
   (`committer`, `time_committed`, `change_type`, `system_id`, `description`); `ATTESTATION` extends
   it for explicit signing. There is **no read-access logging** anywhere in the RM.
2. **EHRbase 2.31.0 has NO ATNA and NO ABAC.** Both existed in the EHRbase 1.x line and were
   **removed in the 1.x→2.x rewrite** (no `ipf.atna` config, no `CompositionAuditInterceptor`, no
   `AbacConfig` on `develop`/2.x). HIP EHRbase ships ATNA/ABAC as **separate commercial** plugins
   (see ADR-0043). So neither read-access auditing nor fine-grained access control exists to "switch
   on" in our tier.
3. **EHRbase 2.31 derives the `CONTRIBUTION` committer from the forwarded auth token** — it ignores
   `openEHR-COMMITTER-*` / `openEHR-AUDIT-*` request headers (empirically confirmed in the M6 probe).

Therefore access auditing and fine-grained access control are the **application's** responsibility.
User decision: implement them ourselves, **in open source, to the IHE ATNA standard, early** (not
deferred).

## Decision

**Three layers.**

1. **Write lineage — openEHR-native (already wired).** Rely on `CONTRIBUTION`/`AUDIT_DETAILS` with
   the committer derived from the forwarded Keycloak token. Use `ATTESTATION` for signed content
   (note-signing in M12, order-signing in M16, CDS-override justification in M15). **No
   `openEHR-COMMITTER-*` headers** (EHRbase 2.31 ignores them).

2. **Access / read / query audit — IHE ATNA emitted from the BFF.** A BFF `auditAccess(...)` helper,
   fired from the `callEhrbase` choke point + the route loaders / server functions on **every PHI
   access**, builds an **IHE-ATNA-conformant DICOM AuditMessage**:
   - `EventIdentification` — action `C/R/U/D/E`, timestamp, outcome `0/4/8/12`.
   - `ActiveParticipant` — actor (Keycloak `sub` + display), role, **purpose-of-use**, source IP.
   - `ParticipantObjectIdentification` — patient / EHR id + resource type + object id.

   Events persist to a **dedicated Postgres `audit` schema** (queryable by the M22 audit-review
   dashboard + the Article-15 patient access-log), with an **optional RFC-5424 syslog/TLS
   forwarder** to an external Audit Record Repository for sites that operate a central audit node.
   An ADR follow-up at build time pins the TypeScript AuditMessage builder + syslog transport.

3. **Fine-grained access control — enforced in the BFF.** A care-relationship / care-team model +
   patient- and template-level checks run **before** proxying to EHRbase (replacing the ABAC that
   EHRbase 2.x dropped). Denial → `403` + `break-glass: available`, wired to the existing break-glass
   flow (M2).

**Standard mapping.** NEN-7513 compliance (who accessed what, when, for what purpose, with what
outcome) is satisfied by the **IHE ATNA event trail**, _not_ by a bespoke hash chain. IHE ATNA is
the open standard; NEN-7513 is the national requirement it fulfils.

**Placement.** Foundational milestone **M9**, before any clinical surface, so every surface from M10
onward is audited + access-controlled from day one. This **un-defers CLAUDE.md Inviolable rules 1
and 2, and the audit half of rule 11** (CONTRIBUTION + ATTESTATION + IHE-ATNA access event).

**Deferred enhancements (add later — not blockers for v1.0 clinical build):** tamper-evidence
hash-chain over the `audit` table, configurable national-law retention + tagged purge, cold-store
WORM tier, the OTel + Tempo/Loki/Prometheus/Grafana observability stack, and the DPIA / DPA / RoPA
compliance documents.

## Consequences

**Positive.** Standards-conformant (IHE ATNA / DICOM Audit Message), fully open-source (no HIP
license), and **richer than EHRbase-side auditing** — the BFF sees the authenticated user, role,
purpose-of-use, patient context, and outcome, which a server-side plugin could not. One emit point
(`callEhrbase`) covers every access because nothing in the architecture bypasses the BFF.

**Negative.** Re-introduces the `audit` Postgres DB/schema the core-refocus removed (now repurposed
to store IHE ATNA events rather than the old hash-chain schema). The `audit` table is itself
PHI-bearing → it is access-gated and access to it is itself audited (meta-audit, M22). A future
deployment that needs tamper-evidence / retention / cold-store adds them as the deferred enhancements
above.
