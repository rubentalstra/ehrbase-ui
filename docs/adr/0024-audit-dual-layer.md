# ADR-0024 — Audit dual-layer: openEHR CONTRIBUTION + NEN-7513 `logAudit`

- **Status:** Accepted
- **Date:** 2026-05-28
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

openEHR's Reference Model (Release 1.1.0) defines `CONTRIBUTION` — every write to an `EHR` produces a `CONTRIBUTION` with an `AUDIT_DETAILS` block (`committer` PARTY_PROXY, `system_id`, `time_committed`, `change_type` enum, `description`). This is **data-lineage** audit: "what changed in the record, when, by whom, due to what change type (creation / modification / deletion / synthesis / amendment)".

Separately, NEN 7513:2024 (per `docs/architecture.md` §14) defines the **access-trail** audit schema: who _accessed_ what data, for what purpose, on what lawful basis, with what outcome. Our `logAudit()` helper (M2) writes this.

These layers answer **different questions**:

| Question                                                          | Layer                                       |
| ----------------------------------------------------------------- | ------------------------------------------- |
| "Who changed Mrs Smith's blood-pressure reading from 140 to 145?" | openEHR CONTRIBUTION                        |
| "Who _read_ Mrs Smith's blood-pressure reading?"                  | NEN-7513 access trail                       |
| "What did the record look like before this change?"               | openEHR CONTRIBUTION (via VERSIONED_OBJECT) |
| "Did the user have a lawful basis to access this data?"           | NEN-7513 access trail                       |
| "What's the chain of changes to this composition?"                | openEHR CONTRIBUTION                        |
| "Show me every clinician who accessed this patient's HIV status"  | NEN-7513 access trail                       |

Both are required for a real EPD. Skipping one is non-compliant: openEHR-only means no access-trail (GDPR Art. 32 + national-law gap); NEN-only means no data-lineage (clinical-safety + integrity gap).

## Decision

**Every PHI-touching UI write produces BOTH layers.**

**For reads** — `logAudit()` only (no CONTRIBUTION; CONTRIBUTIONs are produced by writes).

**For writes** — the BFF EHRbase proxy at `/api/ehrbase/$.ts` ensures both:

1. The write to EHRbase produces a CONTRIBUTION automatically (built into the openEHR write semantics; EHRbase populates `AUDIT_DETAILS` from headers we pass).
2. After the EHRbase write returns 2xx, the proxy calls `logAudit(...)` with the NEN-7513 fields.

If the EHRbase write fails, `logAudit({ outcome: 'FAILURE' })` still emits — we record the attempt.

**CONTRIBUTION population.** The BFF sets these headers on each write to EHRbase:

- `openEHR-COMMITTER-NAME: <session.user.name>`
- `openEHR-COMMITTER-ID: <session.user.id>`
- `openEHR-COMMITTER-ID-NAMESPACE: <our_party_namespace>`
- `openEHR-AUDIT-CHANGE-TYPE: <creation|modification|deletion>` (derived from HTTP method)
- `openEHR-AUDIT-DESCRIPTION: <route_id>` (e.g. `/_authed/patients/$id/notes` so the trail says "written via notes screen")

EHRbase combines these into the `CONTRIBUTION.audit` block on the composition.

**NEN-7513 `logAudit` population** — already specified in §14.2. The proxy infers `action` (READ/CREATE/UPDATE/DELETE/QUERY) from HTTP method, `resourceType` from URL path, `purpose` from session context, `lawfulBasis` from the surface's per-route configuration.

**Cross-reference between the two layers.** Both audit lines for a single write carry the same `correlationId`. The NEN-7513 `logAudit` line additionally carries the EHRbase `CONTRIBUTION` UID once available (returned in the EHRbase response). This lets an audit-reviewer in M15's dashboard cross-link "this NEN access trail" ↔ "this openEHR data-lineage change".

**Pseudonymisation reuse.** Both layers hash the patient identifier with the same secret (the `AUDIT_PSEUDONYM_SECRET` from §14.4 — also reused by ADR-0023's demographic service). Same hashed value across all three stores (audit DB / demographic / EHRbase subject ref) means cross-referencing is just an SQL join, never a re-hash + key-rotation hazard.

**Enforcement** — CLAUDE.md Inviolable rule 11: every PHI-touching UI component MUST go through `requireAuth` → `requireRole` → BFF proxy → (CONTRIBUTION + `logAudit`). The `clinical-ui-reviewer` sub-agent verifies at PR time.

## Consequences

**Positive.** Clinical-safety + regulatory both covered. openEHR data-lineage is automatic from the EHRbase write semantics (we set headers; EHRbase does the rest). NEN-7513 audit reuses the existing M2 `logAudit` helper. The single `correlationId` + shared pseudonymisation secret makes cross-layer joining trivial.

**Negative.** Two audit stores to manage operationally (audit DB + EHRbase contributions). Backup + retention + integrity must cover both. Mitigation: EHRbase contributions live with the rest of EHRbase Postgres (same backup story as the clinical data); the NEN-7513 audit DB has its own backup + integrity job (M4). Two backups, two retention timers, but they're consistent with the data they audit.

If the EHRbase write produces a CONTRIBUTION but the subsequent `logAudit()` fails (e.g. audit DB transient outage), we have a CONTRIBUTION without a matching access-trail row. The proxy retries `logAudit` 3× with backoff before logging to stderr as a fallback — same pattern as M2. The integrity verifier (§14.5) flags missing access-trail rows during the nightly job.
