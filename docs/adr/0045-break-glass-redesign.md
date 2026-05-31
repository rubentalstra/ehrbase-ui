# ADR-0045 — Break-glass redesign: per-EHR, IHE-BTG-audited, review-loop ready

- **Status:** Accepted
- **Date:** 2026-05-31
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** the legacy break-glass flow described in architecture.md §5.6
- **Superseded by:** —

## Context

The legacy break-glass (`grantEmergencyAccess` → a 60-min Valkey JSON blob keyed
per SESSION, a 3/lifetime ceiling, free-text justification) predated the audit
re-grounding (ADR-0041) and did not follow the openEHR / EHRbase / IHE standards
the project commits to. Research (`docs/BREAK-GLASS-DESIGN.md`, sources cited
there) established:

- **openEHR has no native break-glass.** `EHR_ACCESS` / `ACCESS_CONTROL_SETTINGS`
  is an empty pluggable shell; access control is out of openEHR's scope and
  EHRbase 2.31 exposes no enforcement surface (ADR-0043). → the gate, the
  override, and its audit are the **app/BFF's** job.
- **IHE BTG model:** break-glass = a declared **PurposeOfUse that overrides the
  access decision and is recorded in the ATNA trail for mandatory post-hoc
  review.** The code is HL7 v3-ActReason **`BTG`** (OID
  `2.16.840.1.113883.1.11.20448`), carried in the **`EventIdentification`** of
  the DICOM AuditMessage (IHE ITI-20) — **not** on an `ActiveParticipant`.
- **ISO 27789 / NEN-7513:** each access must record who/what/when/**purpose**;
  break-glass must be distinguishable in the log, with a durable justification
  and a mandatory review loop.

The legacy flow emitted **no ATNA event**, stored the justification only in a
60-min Valkey key (no durable evidence), scoped per-session (not per-patient),
and the shipped ATNA builder put PurposeOfUse on the wrong element with a
non-standard code system.

## Decision

**Break-glass is a per-EHR, time-limited, BTG-purposed access mode declared by a
clinician, durably recorded, and BTG-audited on every touch — built entirely in
the BFF.**

1. **ATNA conformance (atna-message.ts):** `PurposeOfUse` moves to
   `EventIdentification`; it is a Zod enum of v3-ActReason codes
   (`TREAT`/`ETREAT`/`BTG`/`ERTREAT`, default `TREAT`) coded with the
   v3-ActReason OID. `AuditAccessInput.purposeOfUse` is typed to that enum.
2. **Durable evidence (`break_glass_grant` table, `audit` schema):** per-EHR
   grant row — actor, ehrId, subjectIdHash, purposeOfUse `BTG`, **justification**,
   grantedAt, expiresAt. Append-only (audit_writer INSERT+SELECT, BEFORE
   UPDATE/DELETE trigger). The justification — which may carry clinical context —
   lives **only** in this access-gated column, **never** in the ATNA message /
   detail / logs (rule 2).
3. **Declaration flow (break-glass.ts):** `ehrId` is REQUIRED; only the
   `clinician` persona may declare (admins/reviewers/researchers get a 403
   `NOT_ELIGIBLE`, audited `ACCESS_DENIED`). A grant (a) inserts the durable row,
   (b) emits an ATNA `EXECUTE` / `BTG` / SUCCESS event (PHI-free), (c) sets a
   Valkey elevation keyed per **(userId, ehrId)**. The per-lifetime ceiling +
   forced re-auth stay as defence-in-depth — NOT the primary control.
4. **Gate seam + BTG propagation (ehr-access.server.ts + callEhrbase):** every
   EHR-scoped EHRbase call runs `careRelationshipGate(ctx, ehrId)` — a pluggable
   `CareRelationshipProvider` (default permissive; M9 swaps in real care-team
   data). Not in-care + no grant → 403 + `break-glass: available` + ATNA
   `ACCESS_DENIED`. While a grant is active, `resolveAccessPurpose` flips every
   audited access to that EHR to `BTG`. **callEhrbase now audits EVERY EHRbase
   access (rule 1 — success and failure)** as the single audit point; callers no
   longer audit EHRbase access themselves (no double rows).

## Scope split

- **Shipped now (this PR):** ATNA conformance fix; `break_glass_grant` table;
  the per-EHR clinician-gated declaration + durable + BTG ATNA event; the
  care-relationship gate **seam** + BTG propagation + callEhrbase access audit;
  the EHR-scoped `/me` declaration UI.
- **M9 (needs care-team data):** replace the permissive `CareRelationshipProvider`
  with a real care-team / encounter check, so the deny → break-glass path
  actually triggers in normal use; the `ATTESTATION` helper for signed emergency
  content; the dedicated patient-page 403 break-glass entry (pre-filling the EHR
  id) lands with the M8 clinical surfaces.
- **M22 (review loop):** the `/admin/audit/emergency` audit-reviewer dashboard —
  list grants, 24 h review-SLA tracker, reviewer decision (itself an audit
  event), notification. The durable `break_glass_grant` + BTG trail feed it.
- **Deferred (post-core, ADR-0041):** hash-chain tamper-evidence over
  `break_glass_grant` + `audit_event`; retention/purge; TLS syslog forwarder to
  an external Audit Record Repository.

## Consequences

- **+** Standards-correct: IHE BTG in EventIdentification, durable evidence, the
  trail is reviewable per ISO 27789 / NEN-7513.
- **+** Rule 1 is now satisfied for the whole EHRbase surface (callEhrbase
  audits every access), not just the demographic admin paths.
- **+** Per-EHR scope replaces the session-wide elevation (ISO 27789
  subject-of-care).
- **−** With the permissive default gate, the deny→break-glass path does not
  fire automatically until M9 supplies care-team data; the explicit declaration
  - BTG trail are fully functional in the interim.
- **−** Auditing every EHRbase call adds one audit-DB insert per call
  (resilient — auditAccess never throws). Acceptable for a clinical access trail.
