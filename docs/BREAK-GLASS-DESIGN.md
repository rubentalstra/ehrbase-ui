# Break-glass / emergency access — standards-aligned design

> Research-backed design for emergency ("break-the-glass") access on
> **openEHR + EHRbase 2.31 + IHE ATNA**. The current `break-glass.ts` flow is
> legacy (pre-ADR-0041) and not standards-aligned; this document is the basis
> for the M9 rewrite. Sources are listed at the end.

## TL;DR

- **openEHR has no native break-glass.** The RM `EHR_ACCESS` / `ACCESS_CONTROL_SETTINGS`
  class is a deliberately empty, pluggable shell; access control is explicitly out of openEHR's
  normative scope, and EHRbase 2.31 does not expose `EHR_ACCESS` as an enforcement surface
  (and has no ABAC — ADR-0043). **The gate, the override, and the audit all live in the app/BFF.**
- **IHE pattern:** break-glass = a declared **PurposeOfUse that overrides the normal access decision
  and is recorded in the ATNA trail for mandatory post-hoc review.** Not a separate protocol.
- **HL7 v3 ActReason code:** use **`BTG`** ("break the glass"), code system OID
  `2.16.840.1.113883.1.11.20448` (siblings: `TREAT`, `ETREAT`, `ERTREAT`). The IHE-current choice is
  `BTG`.
- **ATNA placement (load-bearing):** `PurposeOfUse` goes in **`EventIdentification`**, NOT on
  `ActiveParticipant` (IHE ITI-20). **Our current `atna-message.ts` puts it on `ActiveParticipant` —
  that is a conformance bug to fix.**
- **openEHR write lineage:** writes during break-glass still carry the `CONTRIBUTION` /
  `AUDIT_DETAILS.committer` from the forwarded token; the emergency _purpose_ (BTG) lives in the ATNA
  event, **not** in `AUDIT_DETAILS.description` (PHI-free — rule 2). Signed emergency content uses
  `ATTESTATION.reason` with a controlled, PHI-free value.
- **The real control is the review loop** (ISO 27789 / NEN-7513 / IHE): durable justification,
  per-EHR scope, time-limited auto-expiring elevation, mandatory audit-reviewer review within
  24–48 h, notification. The legacy "3-uses-per-lifetime + forced re-auth" is an arbitrary local
  invention, not the standard.

## What is WRONG with the current `break-glass.ts`

1. **Emits NO ATNA event** with `PurposeOfUse = BTG`. The grant is written only to Valkey JSON; the
   `audit` schema gets nothing. Violates rules 1 & 11 and the entire point of break-glass.
2. **Not wired to a gate.** There is no care-relationship gate yet (M9), so the grant elevates
   nothing concrete.
3. **PHI / evidence risk.** The justification lives only in a 60-min Valkey key — not durable for the
   review SLA. It must be a durable, access-gated column in the `audit` schema, and must NEVER go
   into the ATNA `message` free-text / openEHR `AUDIT_DETAILS.description` (rule 2).
4. **Wrong scope granularity.** Keyed per-session (`breakglass:${sid}`); break-glass MUST be scoped
   per **EHR / patient** (ISO 27789 subject-of-care + IHE patient ParticipantObject).
5. **`3/lifetime + forced re-auth`** is not a standard control. Keep a rate-limit as defence-in-depth,
   but the **review loop** is the actual requirement and is entirely missing.
6. **Stale role gating.** `require-role.ts` hard-codes the old 4-role set, not the 7 personas
   (ADR-0040); only `clinician` sub-roles should be offered break-glass.
7. **ATNA conformance bug** (`atna-message.ts`): `PurposeOfUse` on `ActiveParticipant` (should be
   `EventIdentification`); code-system label `'IHE:PurposeOfUse'` should be the v3-ActReason OID for
   `BTG`/`ETREAT`.

## Recommended design

Reframe from "a 60-min session elevation grant" to **"a per-EHR, BTG-purpose access mode that the BFF
gate honours and ATNA-audits on every touch, with a mandatory review loop."**

### A. The gate (M9, BFF, before proxying to EHRbase)

```
requireRole('clinician') ──► careRelationshipGate(actor, ehrId)
   in-care   → proxy + auditAccess(purposeOfUse: TREAT)
   not-in-care → 403 + header `break-glass: available`
                 + auditAccess(action: ACCESS_DENIED, outcome: FAILURE, purposeOfUse: TREAT)
```

### B. Break-glass declaration (replaces the legacy grant)

On modal submit (keep CSRF + Origin + ≥30-char justification; **make `ehrId` required**):

1. Persist a durable **`break_glass_grant`** row in the `audit` schema:
   `grant_id, actor_user_id, actor_username, actor_roles, ehr_id, subject_id_hash,
 justification (gated text), granted_at, expires_at, reviewed_at, review_decision, reviewer_user_id`.
   The justification lives here (access-gated to `audit-reviewer`), durable for the review SLA.
2. Emit an ATNA grant event via `auditAccess(...)`: `action: 'EXECUTE'`, `outcome: 'SUCCESS'`,
   `purposeOfUse: 'BTG'`, `resource: { type: 'EHR', id: ehrId, isPatient: true }`, `subjectIdHash`,
   `detail: 'break-glass:granted'`. **No justification text in the ATNA message.**
3. Keep a short Valkey TTL elevation keyed per **(sid, ehrId)** as the fast gate-check cache — now a
   derivative of the durable row, not the source of truth.

### C. Every access under break-glass is BTG-tagged

When the gate finds an active grant for `(actor, ehrId)`, it **allows the access but flips the
audited purpose to `BTG`**. Every read/query/write in the window produces an ATNA event with
`PurposeOfUse = BTG` in `EventIdentification`.

### D. Writes during break-glass

Through `callEhrbase`; EHRbase derives the `CONTRIBUTION`/`AUDIT_DETAILS.committer` from the
forwarded token (no `openEHR-COMMITTER-*` headers — rule 11). Emergency purpose stays on the ATNA
side; signed emergency content uses `ATTESTATION.reason` (controlled, PHI-free).

### E. The review loop (the actual standard control)

M22 audit-reviewer dashboard `/admin/audit/emergency`: all BTG grants, 24 h review SLA, reviewer
marks `LEGITIMATE / QUESTIONABLE / INVESTIGATE` (the decision is itself an audit event), team
notification.

### Mapping to the existing `auditAccess(...)`

Minimal change to `apps/web/src/server/audit/atna-message.ts`:

- Restrict `purposeOfUse` to a Zod enum of v3-ActReason codes (`TREAT`/`ETREAT`/`BTG`/`ERTREAT`).
- **Move `PurposeOfUse` from `ActiveParticipant` → `EventIdentification`**; set `codeSystemName` to
  the v3-ActReason OID `2.16.840.1.113883.1.11.20448`.
- Keep `action: 'EXECUTE'` + `purposeOfUse: 'BTG'` + a `detail` tag for the grant (DICOM
  EventActionCode has no break-glass verb — break-glass is a _purpose_, not an _action_).

## Milestone split

**Ship-now (small, standalone — no gate dependency):**

- Fix the ATNA conformance bug (`PurposeOfUse` → `EventIdentification`; correct code-system OID) + its test.
- Zod-restrict `purposeOfUse` to the v3-ActReason value set.
- Make the legacy break-glass at least emit the ATNA `EXECUTE`/`BTG` grant event + persist a durable
  `break_glass_grant` row (justification survives the TTL); make `ehrId` required + scope the Valkey
  key per-EHR.
- Update `require-role.ts` `APP_REALM_ROLES` to the 7 personas; only offer break-glass to `clinician`
  sub-roles.

**M9 (needs the care-relationship gate):** the BFF gate (deny → 403 + `break-glass: available` +
`ACCESS_DENIED` audit); gate honours an active grant → allow + tag `BTG`; wire `auditAccess` into the
`callEhrbase` choke point; `ATTESTATION` helper for signed emergency content.

**M22 (read side):** the `/admin/audit/emergency` review dashboard + SLA + reviewer-decision events +
notification.

**Deferred (post-core, ADR-0041):** hash-chain tamper-evidence over `break_glass_grant` +
`audit_event`; retention/purge; TLS syslog forwarder to an external Audit Record Repository.

## Sources

- openEHR EHR IM (EHR_ACCESS / ACCESS_CONTROL_SETTINGS): <https://specifications.openehr.org/releases/RM/latest/ehr.html>
- openEHR Common IM (AUDIT_DETAILS / ATTESTATION / change_type): <https://specifications.openehr.org/releases/RM/latest/common.html>
- openEHR support terminology (audit change-type codes): <https://specifications.openehr.org/releases/TERM/latest/SupportTerminology.html>
- openEHR ITS-REST EHR API: <https://specifications.openehr.org/releases/ITS-REST/latest/ehr.html>
- IHE ITI Access Control White Paper: <https://wiki.ihe.net/index.php/ITI_Access_Control_White_Paper>
- IHE XUA (TF Vol 1 ch.13): <https://profiles.ihe.net/ITI/TF/Volume1/ch-13.html>
- IHE ITI-20 Record Audit Event (PurposeOfUse in EventIdentification): <https://profiles.ihe.net/ITI/TF/Volume2/ITI-20.html>
- Break-glass / PurposeOfUse (Moehrke): <https://healthcaresecprivacy.blogspot.com/2022/08/break-glass.html>
- HL7 v3 ActReason / PurposeOfUse value set: <https://terminology.hl7.org/CodeSystem-v3-ActReason.html> · <https://terminology.hl7.org/7.0.0/ValueSet-v3-PurposeOfUse.html>
- DICOM PS3.15 Audit Trail Message Format: <https://dicom.nema.org/medical/dicom/current/output/chtml/part15/sect_A.5.html>
- ATNA-by-example: <https://ehealthsuisse.github.io/EPR-by-example/Atna/>
- ISO 27789:2021 (EHR audit trails): <https://www.iso.org/standard/75313.html>
- NEN 7513:2024 (NL): <https://www.nen.nl/en/nen-7513-2024-nl-329182>
