# ADR-0046 — Human-centric patient identity in the UI (no UUIDs as user handles)

- **Status:** Accepted
- **Date:** 2026-05-31
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

The UI forced users to deal with machine identifiers: break-glass made a clinician
**paste an EHR UUID**; the whole workbench (EHR inspect / compositions / compose / directory)
required **pasting a UUID** to do anything; the patient-merge dialog wanted a pasted `partyId`; the
linked-EHR card showed a raw `EHR <uuid>`; and the ⌘K command palette was a placeholder with no
patient search. Nobody remembers or can obtain a UUID/`ehr_id` — this is impractical and unsafe.

The standards are unambiguous: clinicians resolve patients by **name + date of birth + MRN**; the
`ehr_id` is an internal handle resolved server-side from the demographic subject. The EHR and
demographic data are deliberately separated (an EHR in isolation reveals nothing about who it
belongs to), and EHRbase resolves an EHR from its subject, never requiring a human-typed UUID.

Sources: openEHR Demographic IM `PERSON`/`PARTY_IDENTIFIED`/`external_ref` and the EHR/Demographic
separation principle (specifications.openehr.org RM/BASE); EHRbase `GET /ehr?subject_id=&subject_namespace=`

- AQL `… WHERE e/ehr_status/subject/external_ref/id/value = …` (docs.ehrbase.org / ITS-REST 1.0.3);
  FHIR `Patient.name` (family/given) + `Patient.identifier` with the HL7 v2-0203 MRN type code `MR`;
  IHE PDQ (search by name/DOB/MRN); WHO Patient-Safety Solution 2 + Joint Commission (verify identity
  with **two** identifiers — name+DOB / MRN+DOB). Full brief: `docs/BREAK-GLASS-DESIGN.md` siblings +
  the research captured in the M8 plan.

## Decision

**No machine identifier is ever a user-facing handle (Inviolable rule 15).** The UI is patient-centric:

1. **Identity model.** Patients are identified by **name (Family, Given) + DOB (+ age) + MRN + sex**.
   National identifiers (BSN etc.) are not shown / are pseudonymised. The `ehr_id`, composition
   `uid`, and `version_uid` are internal — never the primary display, never a typed input.
2. **Auto-MRN.** The built-in demographic provider auto-assigns a short zero-padded **MRN** at
   `createParty` when none is supplied (counter table, atomic allocation) — every patient has a
   memorable human record number. `DEMOGRAPHIC_AUTO_MRN` (default on) can be turned off for
   deployments fed MRNs by an external system. `CreatePartyInput.identifiers` allows `[]` (create by
   name+DOB alone); the adapter still guarantees a stored party has ≥1 identifier (the MRN).
3. **Global search.** The ⌘K command palette + the `/patients` page search by name / DOB / MRN
   (DOB is a prefix match, so a partial `YYYY` / `YYYY-MM` works). Results show the safe identity
   row. There is no UUID search box anywhere.
4. **Patient-context shell.** `/patients/$patientId` resolves the patient + their `ehr_id` once
   (`getPatientContext`) and provides it to child surfaces via `usePatientContext()`; a clinical
   surface operates inside the selected patient with the `ehr_id` available server-side but never
   shown or typed. `$patientId` (the demographic id) appears in the URL — reached via search/links,
   never typed.
5. **PatientBanner.** A persistent identity header (rule 10 citation) on every patient route:
   Family, Given · DOB (age) · sex · MRN, with active/deceased + EHR-linked flags. The `ehr_id` is
   never rendered.
6. **PatientPicker everywhere a patient is chosen.** Break-glass, the workbench
   (EHR/compositions/compose/directory), and patient-merge all choose a patient by search and
   resolve the `ehr_id` behind the scenes — no pasted UUID. The AQL editor stays an admin power tool
   (ids may appear in OUTPUT; none are typed as INPUT).

## Consequences

- **+** Matches the openEHR / EHRbase / FHIR / IHE model and clinical-safety two-identifier guidance;
  the system is usable by clinicians who think in names, dates, and record numbers.
- **+** A single resolution path (`getPatientContext` / `getLinkedEhr`) means the `ehr_id` is an
  implementation detail, swappable without touching the UI.
- **−** Internal ids still appear in URL paths and as opt-in technical detail — acceptable (reached
  via links, never typed); the rule forbids them as the _primary_ handle / a required input, not
  their existence.
- **Follow-ups:** the patient-context shell hosts the M8+ clinical record surfaces; M9's
  care-relationship gate + break-glass plug into this context; fuzzy/typo-tolerant name search
  (trigram/soundex) is deferred unless requested.
