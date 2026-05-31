# Clinical UI — Screen Catalogue + IA + User Journeys

> Single source of truth for **every clinical surface in the EPD UI** and how it binds to the openEHR open standard. For each EPD surface this catalogue says: _what role uses it_, _what openEHR entry class + CKM archetype(s) back it_, _what audit it emits_, _what AQL queries it consumes_, _what CDS rules can trigger_, _which v1.0 milestone owns it_.
>
> **Milestone numbers were re-sequenced 2026-05-31 (spine-first — [ADR-0042](adr/0042-clinical-milestone-resequencing.md)).** The `M<n>` tags below reflect the **new** numbering; [`IMPLEMENTATION_CHECKLIST.md`](IMPLEMENTATION_CHECKLIST.md) (with its old→new mapping table) is authoritative.

If you're about to write code for a clinical surface, this is the doc you read first.

---

## 1. Scope & non-goals

This UI is a **patient-centric clinical workspace** built on the **openEHR open standard**, sitting on top of an **EHRbase Clinical Data Repository**. The target deployment is **EU hospital + ambulatory + GP clinic** environments. Modelled on the surface area of HIX (ChipSoft) and Epic — i.e. a real EPD, not an admin/power-user tool around AQL.

**In scope for v1.0** — the 22 screens in the catalogue below. **Multi-role from day one — seven personas** (physician + nurse + lab-technician + pharmacist + admin + audit-reviewer + researcher; [ADR-0040](adr/0040-expanded-role-model.md)). EU-wide (GDPR + EHDS baseline; national overlays per `docs/architecture.md` §14).

**Out of scope — deferred to v1.x.** Every item in `docs/v1.x-roadmap.md`: scheduling, embedded DICOM viewer, real-time WS/SSE, AI/LLM CDS, native mobile, offline/PWA, real GDL2 engine, external PMI integration, EHDS cross-border features, patient portal, and the audit/observability **hardening** (hash-chain tamper-evidence, retention, cold-store, OTel stack) on top of the v1.0 IHE ATNA trail.

---

## 2. openEHR primer (read this before §6 if you're new to the spec)

openEHR is the open standard that defines _how clinical data is modelled, stored, and queried_ in a way that is interoperable across systems and stable across decades. The full reference is `specifications.openehr.org`; what follows is the minimum you need to read this catalogue.

### Two information models, logically separate

> _"One of the basic principles of openEHR is the complete separation of EHR and demographic information, such that an EHR taken in isolation contains little or no clue as to the identity of the patient it belongs to."_ — openEHR Base architecture overview

- **EHR Information Model** — clinical record. Top-level class `EHR` holds `compositions[]`, `folders[]` (a `DIRECTORY`), `ehr_status`, `ehr_access`, `contributions[]`.
- **Demographic Information Model** — patient master + clinician master + organisation directory. `PARTY` (abstract) → `PERSON` / `ORGANISATION` / `GROUP` / `AGENT`; `ROLE`; `PARTY_IDENTITY`; `CONTACT`; `ADDRESS`; `PARTY_RELATIONSHIP`; `CAPABILITY`.

A `COMPOSITION` references its subject via a `PARTY_PROXY` / `PARTY_SELF` / `PARTY_IDENTIFIED` — these are **references**, not the demographic data itself. The data lives in the demographic store.

**EHRbase implements only the EHR side** (REST API: EHR / Query / Definition; no `/demographic/*`). Per [ADR-0031](adr/0031-pluggable-demographic-provider.md) we ship a **pluggable demographic provider** — the built-in adapter (`packages/demographic-core`) is the v1.0 default openEHR-spec service (own Postgres schema + REST surface); deployments with an existing PMI can re-add a wire adapter behind the retained `DemographicProvider` interface (the FHIR adapter was removed in the 2026-05-31 core-refocus; HL7 v2 ADT + IHE PDQ slots are reserved for v1.x). See M7 in the implementation checklist + `docs/FOUNDATION-SCOPE.md`.

### The six RM entry classes

Every clinical screen ultimately reads or writes one of:

| Entry class       | What it records            | UI surfaces in this catalogue                                  |
| ----------------- | -------------------------- | -------------------------------------------------------------- |
| **OBSERVATION**   | Measured / recorded data   | Vitals, labs                                                   |
| **EVALUATION**    | Interpretive statements    | Problem list, allergies, immunisation summary                  |
| **INSTRUCTION**   | Intended action / order    | Medication orders, lab orders, imaging orders, care-plan items |
| **ACTION**        | Record of action performed | Medication administration, procedure done, vaccination given   |
| **ADMIN_ENTRY**   | Administrative data        | Admission/discharge events, transfer notices                   |
| **GENERIC_ENTRY** | Generic fallback           | Rare; archetypes pick a specific class                         |

### Archetypes + Operational Templates

- **Archetype** — a constrained pattern of one entry class. Identified by a CKM ID like `openEHR-EHR-OBSERVATION.blood_pressure.v2`. Defines: which `DV_*` data-type instances appear at which paths, with which constraints. Published on the Clinical Knowledge Manager (CKM, `ckm.openehr.org/ckm/`).
- **Operational Template (OPT)** — a _composition_ of archetypes + slot fillers for a specific use case (e.g. an "Adult ED admission" template bundles diagnosis + vitals + allergy archetypes). EHRbase fetches OPTs via `/definition/template/adl1.4/{id}` and serves a **Web Template** JSON (flattened with `rmType` + `inputs[]` per leaf) — drives our `FieldRenderer` (M6).

ADR-0016 locks the **v1.0 archetype catalogue** — the specific CKM archetype IDs used per surface (international by default; national overrides per surface where a CKM-NL / CKM-DE / CKM-FR variant adds value).

### Composition formats

EHRbase accepts three. We use:

- **FLAT** for writes (form state maps directly — see EHRbase docs §8 Flat).
- **STRUCTURED** for reads (tree views, easier to traverse).
- **CANONICAL** for export (FHIR Bundle generation, inter-system exchange).

### AQL (Archetype Query Language)

`SELECT … FROM EHR CONTAINS COMPOSITION CONTAINS OBSERVATION` — first-class query semantics. Every screen that reads aggregate data uses **named, parameterised, version-pinned** AQL queries from `docs/aql-catalogue.md`. The query name is what gets audited, never the AQL body.

### Audit — write lineage (native) + access trail (IHE ATNA, ours)

openEHR audits **writes only**. Every write to EHRbase produces a `CONTRIBUTION` with `AUDIT_DETAILS` (`committer`, `system_id`, `time_committed`, `change_type`, `description`) — openEHR's native **data-lineage** audit. The committer is derived from the forwarded Keycloak token (EHRbase 2.31 ignores `openEHR-COMMITTER-*` / `openEHR-AUDIT-*` headers). `ATTESTATION` extends `AUDIT_DETAILS` for explicit signing (note-signing, order-signing, CDS-override).

openEHR has **no read-access logging**, and **EHRbase 2.31.0 has no native ATNA or ABAC** (both were removed in the 1.x→2.x rewrite — [ADR-0043](adr/0043-ehrbase-oss-boundary.md)). So our **access trail** is built at the application layer to the **IHE ATNA** standard: a BFF `auditAccess(...)` helper emits an IHE-ATNA-conformant DICOM AuditMessage on **every** PHI read / write / query → a queryable Postgres `audit` schema (+ optional syslog forwarder). This is the foundational milestone **M9** ([ADR-0041](adr/0041-audit-access-governance.md)); the audit-review dashboard + Article-15 patient log (M22) read that trail.

**Inviolable rule 11** therefore reads: every EHRbase access emits **(a)** the native `CONTRIBUTION`/`AUDIT_DETAILS` (+ `ATTESTATION` on sign) write lineage, **and (b)** an IHE ATNA access event via the BFF (rule 1). Throughout §7 the **"Audit:"** line names the audited action + purpose; the mechanism is always (a)+(b).

### Terminology

openEHR archetypes bind coded fields to external terminologies (SNOMED CT, LOINC, ICD-10, ATC) via FHIR `ValueSet/$expand`. Per ADR-0022 we use **Snowstorm** (SNOMED International, open-source, self-hosted) as our v1.0 terminology server, behind the pluggable terminology provider (ADR-0034).

### Clinical decision support — GDL2

openEHR has a formal CDS spec: **GDL2** (`/releases/CDS/Release-2.0.1`). Rules bind to archetype paths via `data_bindings`, declare `pre_conditions`, emit results. Per ADR-0021 v1.0 ships a native rule evaluator at the BFF using a GDL2-aligned format (~10 baseline rules: drug-allergy, drug-drug, age/weight contraindications). Built in **M15** — _after_ the clinical-data surfaces it evaluates exist (ADR-0042). Real GDL2 engine integration is v1.x.

### Task Planning — care plans + order sets

openEHR's **PROC** component (`/releases/PROC/Release-1.7.0`) defines `WORK_PLAN` / `TASK_PLAN` / `PLAN_ITEM`. Each can reference a `care_pathway` / `care_plan` / `guideline` / `best_practice_ref` / `order_set_type` / `order_set_id`. Per ADR-0025 this is the canonical care-plan + order-set model in v1.0 (M16 orders, M17 care plan).

---

## 3. User journeys

Five scenarios that drove milestone priority + which surfaces ship in v1.0.

### 3.1 Ward physician — morning round

> Dr Iris opens the EPD at the start of her morning round. From her **physician home** (M19) she sees today's ward patients with critical-flag highlighting. She clicks the first patient → the **patient banner** (M8) loads (name + DOB + allergies summary + active-problems summary). She skims the **problem list** (M10), checks **vitals from the last 24 h** (M13 flowsheet), reviews **overnight labs** (M14 timeline) flagged abnormal. She opens the **clinical notes** tab (M12), starts a SOAP-structured progress note. Mid-note, she places a **lab order** (M16) — the CDS rule (authored + evaluated by M15) "elevated creatinine + nephrotoxic drug active" triggers and she adjusts. Note saved + signed. She moves to the next patient.

### 3.2 Bedside nurse — vitals + medication round

> Nurse Pieter starts his morning round at workstation-on-wheels. **Nurse home** (M19) lists his patients with overdue care-plan tasks highlighted. First patient: record morning vitals via **vitals quick-entry** (M13). Walk to next bed: administer the 09:00 medication → **medication administration** (M11) — the system confirms the right drug, dose, time; the **CDS** (M15 runtime) allergy check has already cleared at order-write time so no alert fires. Closes the **care-plan task** (M17) "vitals check 09:00". Throughout the round he sees the **patient banner** (M8) at the top of every screen with critical allergies in red.

### 3.3 Lab technician — result entry + validation

> Laborant Sanne works the chemistry bench. She opens the **labs surface** (M14) for the patient whose sample just resulted, enters the LOINC-coded result values (or validates an interfaced result), and marks the panel validated. Abnormal values flag against the reference range; a critical value triggers the M15 `cds_006_critical_lab` rule, which (via M23) drops an alert into the ordering physician's inbox. Every read + write she makes is access-audited (M9).

### 3.4 GP outpatient consultation

> Dr Anna's day is patient by patient. Her **physician home** (M19) shows today's appointment list (read from a v1.x scheduling system, surfaced as a configured external feed). She clicks Mr Jansen → banner + problem list. She opens the **incoming referral letter** (M18 documents). Reads it. Opens the **encounter note** (M12), structured around the referral question. She writes a brief assessment. Updates the **problem list** (M10) with a new diagnosis. Sends a **referral letter** (M18) back to the referrer + an outgoing one to a specialist.

### 3.5 Audit reviewer — quarterly sample-of-60

> Compliance officer Sven opens the **audit-review dashboard** (M22). The sample-of-60 algorithm has pre-selected 60 random PHI-access events from the last quarter — read from the IHE ATNA trail emitted by the M9 layer. He drills into the first: "user X read patient Y composition Z, purpose TREATMENT". He cross-checks user X had a care relationship with patient Y at the time. Marks **Reviewed: OK**. Repeats for the 59 others. The dashboard tracks his review status; the system audits _his_ access too (meta-audit).

### 3.6 Patient — exercising Article 15

> Carla is a patient. She logs into the patient-facing surface and visits `/me/access-log` (M22). She sees every access to her record over the last 12 months (who, when, what kind of access, what role, what purpose) — the IHE ATNA trail rendered for her. She downloads a PDF of the log for her records. (The patient portal beyond `/me/access-log` is v1.x — see `docs/v1.x-roadmap.md`.)

---

## 4. Information architecture (sitemap)

```
/                                  # public landing
/{locale}/accessibility            # public accessibility statement (§12.8)

/{locale}/_authed/                 # authed shell starts here
├── role-picker                    # multi-role users pick today's role (ADR-0040)
├── home                           # role-specific dashboard (basic landing M8 → rich M19)
│   ├── (physician)                # today's ward patients + critical flags
│   ├── (nurse)                    # my-ward patients + overdue tasks
│   ├── (lab-technician)           # pending / unvalidated result worklist
│   ├── (pharmacist)               # orders to verify + interaction queue
│   ├── (admin)                    # operational ops widgets
│   ├── (audit-reviewer)           # pending sample-of-60 reviews
│   └── (researcher)               # AQL workspace + saved queries
│
├── patients
│   ├── search                     # global patient search (M8)
│   ├── recent                     # recently viewed (M8)
│   └── $patientId/
│       ├── (banner everywhere)    # cross-cutting; always visible (M8)
│       ├── encounters             # encounter / visit list (M8)
│       ├── problems               # problem list + allergies + immunisations (M10)
│       ├── medications            # active meds + admin history (M11)
│       ├── vitals                 # flowsheet + charts (M13)
│       ├── labs                   # results timeline (M14)
│       ├── notes                  # clinical notes (M12)
│       ├── orders                 # CPOE — meds / labs / imaging (M16)
│       ├── care-plan              # tasks + goals (M17)
│       └── documents              # discharge / referrals / PDF / DICOM-list (M18)
│
├── inbox                          # messages + lab alerts + referrals incoming (M23)
├── aql                            # power-user query editor (M20)
│
├── me                             # current user account
│   └── access-log                 # Article 15 patient-facing audit log (M22, fed by M9)
│
└── admin/                         # admin role only
    ├── patients                   # FULL demographic admin UI (M7)
    ├── users                      # Keycloak admin proxy (M21)
    ├── audit                      # sample-of-60 review dashboard (M22)
    └── cds-rules                  # CDS rule authoring (M15)
```

URL pattern is **symmetric per locale** — `/en/...`, `/nl/...`, `/de/...` etc. (per the M3 i18n setup; ADR-0014). v1.0 ships English; additional locales land at the M24 release (additive in Paraglide).

---

## 5. Role dashboards

Seven v1.0 personas. First-login picker per [ADR-0040](adr/0040-expanded-role-model.md); switchable via the user menu thereafter. The **basic** my-patients landing ships in M8; the **rich** dashboards below ship in M19 (after the data they aggregate exists).

### 5.1 Physician home

- **Top:** my ward patients today (or my outpatient appointments — configured per deployment).
- **Card per patient:** banner summary + critical flags + recent labs alert badge.
- **Side panel:** my pending tasks (signing notes, co-signing orders).
- **Bottom:** inbox preview.

### 5.2 Nurse home

- **Top:** my-ward patients with task badges (overdue / due-now / done).
- **Card per patient:** vitals due, meds due, care-plan tasks open.
- **Side panel:** recently administered meds + sign-offs needed.

### 5.3 Lab-technician home

- **Top:** result worklist — pending / unvalidated lab panels for the technician's bench/section.
- **Card per item:** ordering clinician, sample time, abnormal/critical pre-flag.
- **Side panel:** recently validated results + items awaiting re-run.

### 5.4 Pharmacist home

- **Top:** medication orders awaiting verification / dispense.
- **Card per order:** drug + dose + route + the CDS interaction/allergy flags raised at prescribe time.
- **Side panel:** interaction-review queue + clarifications requested from prescribers.

### 5.5 Admin home

- **Top:** operational widgets — active sessions, recent break-glass invocations, audit-review backlog.
- **Side panel:** link to user / role management.

### 5.6 Audit-reviewer home

- **Top:** sample-of-60 review queue (from the M9 IHE ATNA trail).
- **Side panel:** review-status by quarter; anomaly-heuristic surface.

### 5.7 Researcher home

- **Top:** saved AQL queries + recent runs.
- **Side panel:** export jobs + pseudonymisation status.

---

## 6. Patient header model

The banner that appears on every patient sub-route. Reads from the M7 demographic **provider** + EHR `ehr_status` + a small set of summary AQL queries.

| Field                                   | Source                                                                                        | Fallback                                                          |
| --------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Name (display)                          | M7 `PERSON.name`                                                                              | "Unknown" — never block on demographic miss                       |
| DOB + age                               | M7 `PERSON.date_of_birth`                                                                     | "Unknown"                                                         |
| Sex / gender                            | M7 `PERSON.sex`                                                                               | "Not specified"                                                   |
| Pseudonymised national ID display       | M7 `PARTY_IDENTITY.details` (NL: BSN, BE: NISS, FR: NIR, DE: KVNR, …) — display last 4 + hash | —                                                                 |
| MRN                                     | M7 `PARTY_IDENTITY.details` (MRN issuer)                                                      | —                                                                 |
| Active allergies count + worst severity | AQL `patient_summary_header` → counts `EVALUATION.adverse_reaction_risk.v1`                   | "Unknown"                                                         |
| Active problems count                   | AQL `patient_summary_header` → counts active `EVALUATION.problem_diagnosis.v1`                | 0                                                                 |
| Critical alert flag                     | derived from CDS-rule state at last write (M15)                                               | none                                                              |
| Care relationship indicator             | role-context from auth + the care-team model (M8); enforced at the BFF gate (M9)              | "Not in your care" (read-only mode + break-glass prompt per §5.6) |

The banner is built **once** (M8) and reads `patient_summary_header`, which returns empty until M10/M15 populate problems/allergies/CDS-state — so the counts + critical flag light up automatically as those surfaces land (not a stub). Critical allergies render in red. If a clinician is not in the care relationship, the banner shows a "Break-glass" button (the M9 access gate).

---

## 7. Screen catalogue

For each surface: **purpose · role(s) · openEHR entry class · CKM archetype ID(s) · OPT · format · AQL queries · components · audit · CONTRIBUTION fields · CDS · role gating · route · v1.0 / v1.x scope.**

The **"Audit:"** line names the audited action + purpose; the mechanism is always native `CONTRIBUTION`/`AUDIT_DETAILS` (+ `ATTESTATION` on sign) on writes **and** an IHE ATNA access event via the BFF (M9, ADR-0041). National overrides per ADR-0016 (decision #11).

### 7.1 Patient header banner — _cross-cutting_ (M8)

- **Purpose:** persistent at-a-glance patient identity + critical info.
- **Roles:** all clinical (physician, nurse, lab-technician, pharmacist; audit-reviewer with explicit override).
- **openEHR:** read from `EHR_STATUS` + Demographic Service `PERSON` / `PARTY_IDENTITY`; summary counts from AQL.
- **Archetypes:** N/A (composite view); the AQL counts `EVALUATION.problem_diagnosis.v1` and `EVALUATION.adverse_reaction_risk.v1`.
- **Components:** `Card`, `Badge` (severity), shadcn `Avatar`, custom `BreakGlassButton`.
- **Audit:** `READ` on `EHR` (resource type), purpose `TREATMENT`.
- **CDS:** if the "critical allergy + active matching med" rule (M15) was triggered at last write, display the alert badge.
- **Role gating:** `requireAuth` + the M9 care-relationship gate; banner shows different controls per role.
- **Route:** wraps `/_authed/patients/$patientId/*`.
- **Scope:** v1.0.

### 7.2 Global patient search — M8

- **Purpose:** find a patient by name, DOB, MRN, or pseudonymised national-ID prefix.
- **Roles:** physician, nurse, lab-technician, pharmacist, admin.
- **openEHR:** queries the M7 demographic **provider** (the EHR has no name to search). Cross-checks an EHR exists via `/ehr` lookup by `subject.external_ref`.
- **Components:** `Command` (cmdk), `Input`, `DataTable`.
- **Audit:** `QUERY` on `PARTY`, purpose `TREATMENT`.
- **CDS:** none.
- **Role gating:** any clinical persona / admin.
- **Route:** `/_authed/patients/search`.
- **Scope:** v1.0.

### 7.3 Recently viewed — M8

- **Purpose:** clinician-personal list of last N opened patients.
- **Roles:** physician, nurse, lab-technician, pharmacist.
- **Storage:** per-user table in our app Postgres (NOT openEHR — this is UI state).
- **Components:** `Card` list.
- **Audit:** none at view (the visit-list itself isn't PHI access; opening a patient is what audits).
- **Route:** `/_authed/patients/recent`.
- **Scope:** v1.0.

### 7.4 Encounter / visit list — M8

- **Purpose:** chronological list of patient's visits (compositions grouped by `DIRECTORY/FOLDER`).
- **Roles:** physician, nurse.
- **openEHR:** AQL over `EHR.compositions[]` joined to `DIRECTORY/FOLDER` entries.
- **Archetypes:** `openEHR-EHR-COMPOSITION.encounter.v1` (international).
- **AQL:** `patient_encounters_recent`.
- **Components:** virtualised `DataTable`.
- **Audit:** `QUERY` on `COMPOSITION`.
- **Route:** `/_authed/patients/$patientId/encounters`.
- **Scope:** v1.0 (populates once M12 notes create encounters).

### 7.5 Vitals flowsheet — M13

- **Purpose:** time × vital-sign grid + trend lines.
- **Roles:** physician, nurse (write); all clinical (read).
- **openEHR entry class:** OBSERVATION.
- **Archetypes (international CKM):**
  - `openEHR-EHR-OBSERVATION.blood_pressure.v2`
  - `openEHR-EHR-OBSERVATION.pulse.v2`
  - `openEHR-EHR-OBSERVATION.body_temperature.v2`
  - `openEHR-EHR-OBSERVATION.respiration.v2`
  - `openEHR-EHR-OBSERVATION.pulse_oximetry.v1`
  - `openEHR-EHR-OBSERVATION.body_weight.v2`
  - `openEHR-EHR-OBSERVATION.height.v2`
  - `openEHR-EHR-OBSERVATION.body_mass_index.v2`
- **OPT:** "Adult vital signs" OPT bundles the above.
- **Format:** FLAT for write; STRUCTURED for grid render.
- **AQL:** `vitals_latest_*` + `vitals_trend_*` (one per archetype).
- **Components:** custom `VitalsFlowsheet` (grid), Recharts `LineChart` (per ADR-0018), `QuickEntryDrawer`.
- **Audit:** `READ` / `CREATE` on `OBSERVATION`, purpose `TREATMENT`.
- **CONTRIBUTION on write:** `committer` = clinician id (from token), `change_type` = `creation`.
- **CDS:** "BP >180/120 critical" rule (M15 runtime) fires on write.
- **Role gating:** read = clinical; write = physician/nurse.
- **Route:** `/_authed/patients/$patientId/vitals`.
- **Scope:** v1.0.

### 7.6 Lab results timeline — M14

- **Purpose:** chronological lab results with abnormal-flag highlighting + trend; technician entry/validation.
- **Roles:** lab-technician (enter/validate), physician (review/sign), nurse + all clinical (read).
- **openEHR entry class:** OBSERVATION.
- **Archetypes:** `openEHR-EHR-OBSERVATION.laboratory_test_result.v1`, `openEHR-EHR-OBSERVATION.urinalysis.v1`. LOINC-coded per Snowstorm.
- **OPT:** lab-result OPT per lab provider.
- **AQL:** `labs_recent_results`, `labs_results_by_loinc`.
- **Components:** `DataTable`, Recharts `LineChart`, abnormal-flag `Badge`.
- **Audit:** `READ` / `CREATE` on `OBSERVATION`.
- **CDS:** "elevated creatinine + nephrotoxic drug active" rule cross-references M11 active meds (rule defined + evaluated by the M15 runtime).
- **Role gating:** lab-technician write/validate; physician sign; all clinical read.
- **Route:** `/_authed/patients/$patientId/labs`.
- **Scope:** v1.0.

### 7.7 Clinical notes — M12

- **Purpose:** structured + free-text encounter notes (SOAP / narrative).
- **Roles:** physician, nurse (with role-specific note types).
- **openEHR entry class:** COMPOSITION (SOAP via SECTION), EVALUATION (`clinical_synopsis`).
- **Archetypes:** `openEHR-EHR-COMPOSITION.encounter.v1`, `openEHR-EHR-COMPOSITION.report.v1`, `openEHR-EHR-EVALUATION.clinical_synopsis.v1`, plus any structured-data archetype the note imports.
- **OPT:** per note type (progress note, admission note, discharge prep).
- **Format:** FLAT for write; CANONICAL for export.
- **Components:** custom `NoteEditor` (TipTap-based rich text + structured-field slots), `SignButton`.
- **Audit:** `CREATE` / `UPDATE` on `COMPOSITION`.
- **CONTRIBUTION on sign:** `ATTESTATION` recorded; `change_type` = `creation`, `description` includes "signed".
- **CDS:** none directly (notes don't trigger rules unless they create orders).
- **Role gating:** physician (full note types); nurse (nurse-specific note types).
- **Route:** `/_authed/patients/$patientId/notes`.
- **Scope:** v1.0.

### 7.8 Problem list — M10

- **Purpose:** active + resolved problems / diagnoses.
- **Roles:** physician (write), all clinical (read).
- **openEHR entry class:** EVALUATION.
- **Archetypes:** `openEHR-EHR-EVALUATION.problem_diagnosis.v1`. SNOMED CT-coded per Snowstorm.
- **AQL:** `problems_active`, `problems_history`.
- **Components:** `DataTable`, `Sheet` for add/edit, `Badge` (status).
- **Audit:** `READ` / `CREATE` / `UPDATE` on `EVALUATION`.
- **CDS:** "new problem + contraindicated active med" rule (M15) fires.
- **Route:** `/_authed/patients/$patientId/problems` (combined view with §7.10 + §7.11).
- **Scope:** v1.0.

### 7.9 Medications (active list) — M11

- **Purpose:** active medication orders + administration history.
- **Roles:** physician (prescribe), pharmacist (verify/dispense), nurse (administer + read), all clinical (read).
- **openEHR entry class:** INSTRUCTION (order) + ACTION (administration).
- **Archetypes:** `openEHR-EHR-INSTRUCTION.medication_order.v3`, `openEHR-EHR-ACTION.medication.v1`. ATC-coded.
- **AQL:** `medications_active`, `medication_administrations_recent`.
- **Components:** `DataTable`, custom `MedicationCard` per active med, `AdministerDrawer` (nurse), `PrescribeDrawer` (physician), `VerifyDrawer` (pharmacist).
- **Audit:** `READ` / `CREATE` / `UPDATE` on `INSTRUCTION` and `ACTION`.
- **CDS:** drug-allergy, drug-drug, dose-range checks on prescribe (M15).
- **Route:** `/_authed/patients/$patientId/medications`.
- **Scope:** v1.0.

### 7.10 Allergies — M10

- **Purpose:** active allergy + adverse-reaction list with severity.
- **Roles:** physician (write), nurse (write — for new-detected reactions), all clinical (read).
- **openEHR entry class:** EVALUATION.
- **Archetypes:** `openEHR-EHR-EVALUATION.adverse_reaction_risk.v1`. SNOMED CT-coded.
- **AQL:** `allergies_active`.
- **Components:** `DataTable`, `Badge` (severity), `Sheet` for add.
- **Audit:** `READ` / `CREATE` on `EVALUATION`.
- **CDS:** every write triggers the drug-allergy rule (M15) against active meds.
- **Route:** combined with problems at `/_authed/patients/$patientId/problems`.
- **Scope:** v1.0.

### 7.11 Immunisations — M10

- **Purpose:** vaccination history.
- **Roles:** physician + nurse (write); all clinical (read).
- **openEHR entry class:** ACTION.
- **Archetypes:** `openEHR-EHR-ACTION.immunisation.v1`. SNOMED CT-coded vaccines.
- **AQL:** `immunisations_history`.
- **Components:** `DataTable`, timeline view.
- **Audit:** `READ` / `CREATE` on `ACTION`.
- **Route:** `/_authed/patients/$patientId/problems` (combined tab).
- **Scope:** v1.0.

### 7.12 Orders / CPOE — M16

- **Purpose:** prescribe medications, request labs, request imaging.
- **Roles:** physician (write), pharmacist (verify medication orders), nurse (read + flag for clarification), lab-technician (receives lab orders).
- **openEHR entry class:** INSTRUCTION (order) + ACTION (fulfilment).
- **Archetypes:**
  - `openEHR-EHR-INSTRUCTION.medication_order.v3`
  - `openEHR-EHR-INSTRUCTION.laboratory_test_order.v1`
  - `openEHR-EHR-INSTRUCTION.imaging_examination_request.v1`
  - `openEHR-EHR-ACTION.medication.v1`
  - `openEHR-EHR-ACTION.procedure.v1`
- **Order sets:** Task Planning `order_set_id` (ADR-0025).
- **AQL:** `orders_pending`, `orders_recent_completed`.
- **Components:** `OrderSetPicker`, `DataTable`, `Sheet` per order type, `Alert` for CDS warnings.
- **Audit:** `CREATE` / `UPDATE` on `INSTRUCTION`; order signing via `ATTESTATION`.
- **CDS:** drug-allergy + drug-drug + dose-range rules (M15). Dismissible with documented justification (audited).
- **Role gating:** physician for write; pharmacist verify; nurse for read.
- **Route:** `/_authed/patients/$patientId/orders`.
- **Scope:** v1.0.

### 7.13 Care plan + tasks — M17

- **Purpose:** interdisciplinary tasks, goals, outcome measures.
- **Roles:** physician + nurse + care-team members.
- **openEHR entry class:** INSTRUCTION (plan) + ACTION (completion). Uses **PROC** component (`WORK_PLAN`, `TASK_PLAN`, `PLAN_ITEM`).
- **Archetypes:** `openEHR-EHR-INSTRUCTION.care_plan` (versions per CKM), `openEHR-EHR-ACTION.care_plan`.
- **AQL:** `care_plan_active_tasks`, `care_plan_tasks_overdue`.
- **Components:** `TaskList`, `GoalCard`, `Checkbox` (task completion → ACTION write).
- **Audit:** `READ` / `CREATE` / `UPDATE` on `INSTRUCTION` and `ACTION`.
- **Route:** `/_authed/patients/$patientId/care-plan`.
- **Scope:** v1.0.

### 7.14 AQL editor + result tables — M20

- **Purpose:** power-user surface for ad-hoc queries.
- **Roles:** researcher, audit-reviewer (with pseudonymised dataset).
- **openEHR:** AQL spec Release 1.1.0.
- **Components:** CodeMirror 6 + AQL grammar, `DataTable` (virtualised), `SaveQueryDialog`.
- **Audit:** `QUERY` on whatever resource type the query touches; named queries log only the name, ad-hoc queries log a hash of the AQL body (never the body in clear).
- **Rate limit:** stricter for `aql-complex` per §5.9.
- **Role gating:** researcher / audit-reviewer.
- **Route:** `/_authed/aql`.
- **Scope:** v1.0.

### 7.15 Admin — user / role management — M21

- **Purpose:** create users, assign roles, configure clinics / departments.
- **Roles:** admin only.
- **Backend:** proxy to Keycloak admin API via BFF.
- **Components:** `DataTable`, `Sheet` per user.
- **Audit:** `ADMIN_CHANGE` events.
- **Route:** `/_authed/admin/users`.
- **Scope:** v1.0.

### 7.16 Audit-review dashboard — M22 (fed by M9)

- **Purpose:** sample-of-60 quarterly review of the IHE ATNA access trail (cited as the EU-baseline review SLA per architecture.md §14).
- **Roles:** audit-reviewer.
- **Backend:** queries the `audit` schema (the M9 IHE ATNA trail — NOT EHRbase).
- **Components:** `DataTable`, `Drawer` for drill-down, `MarkReviewedButton`.
- **Audit:** `META_AUDIT_ACCESS` (the reviewer's access is itself audited).
- **Route:** `/_authed/admin/audit`.
- **Scope:** v1.0.

### 7.17 CDS rule authoring — M15

- **Purpose:** view + author CDS rules in the GDL2-aligned internal format.
- **Roles:** admin (with CDS-author sub-role).
- **Components:** custom `RuleEditor` (form-based, not raw GDL2 syntax editing), `ToggleActive`.
- **Audit:** `ADMIN_CHANGE` on rule create/update/disable.
- **Route:** `/_authed/admin/cds-rules`.
- **Scope:** v1.0.

### 7.18 Discharge summary — M18

- **Purpose:** structured discharge document; assembles problems / meds / instructions / follow-up.
- **Roles:** physician.
- **openEHR entry class:** COMPOSITION.
- **Archetypes:** `openEHR-EHR-COMPOSITION.discharge_summary.v1`.
- **OPT:** discharge-summary OPT per deployment.
- **Components:** custom `DischargeSummaryEditor` (assembles from existing data), `PrintPreview`.
- **Audit:** `CREATE` on `COMPOSITION`.
- **CONTRIBUTION:** `change_type` = `creation`, `description` includes "discharge_summary".
- **Route:** `/_authed/patients/$patientId/documents/discharge`.
- **Scope:** v1.0.

### 7.19 Referrals — M18

- **Purpose:** incoming + outgoing referral letters.
- **Roles:** physician (write), all clinical (read).
- **openEHR entry class:** COMPOSITION.
- **Archetypes:** `openEHR-EHR-COMPOSITION.referral.v0` (international; if a national CKM has a more stable variant, override per ADR-0016).
- **Components:** `DataTable` for list, `ReferralEditor`, `PrintPreview`.
- **Audit:** `READ` / `CREATE` on `COMPOSITION`.
- **Route:** `/_authed/patients/$patientId/documents/referrals`.
- **Scope:** v1.0.

### 7.20 Document viewer (PDF + image + DICOM-list) — M18

- **Purpose:** display attached documents; list DICOM studies with external-viewer link.
- **Roles:** all clinical.
- **openEHR:** documents stored as `DV_MULTIMEDIA` inside compositions (or as URL `DV_URI` for DICOM, with metadata in OBSERVATION.imaging_examination_result).
- **Components:** PDF.js viewer, image viewer, `Card` for DICOM listing with "Open in PACS viewer" external link (per ADR-0020 — decision #6).
- **Audit:** `READ` on `COMPOSITION` (containing the document).
- **Route:** `/_authed/patients/$patientId/documents`.
- **Scope:** v1.0; embedded DICOM viewer is v1.x.

### 7.21 Inbox / messaging — M23

- **Purpose:** in-app inbox for lab-result alerts, referral responses, internal messages.
- **Roles:** all clinical.
- **Storage:** non-openEHR — internal app DB (messages are workflow, not clinical content).
- **Lab-alert generation:** via **AQL polling** (EHRbase 2.x has no native event trigger — ADR-0043) when a result lands abnormal / CDS `cds_006` triggers.
- **Components:** `DataTable`, `Sheet` per thread.
- **Audit:** `READ` on `MESSAGE` (custom resource type), purpose `TREATMENT` when patient-linked.
- **Route:** `/_authed/inbox`.
- **Scope:** v1.0.

### 7.22 Article 15 access log — M22 (fed by M9)

- **Purpose:** patient-facing audit log; patient sees who accessed their record.
- **Roles:** patient themself (auth via OIDC for the patient surface — v1.x patient portal extends this; v1.0 only the access-log page is patient-reachable).
- **Backend:** queries the `audit` schema (the M9 IHE ATNA trail).
- **Components:** `DataTable`, PDF download.
- **Audit:** `META_AUDIT_ACCESS` when the patient views.
- **Route:** `/_authed/me/access-log`.
- **Scope:** v1.0 (the IHE ATNA trail is emitted from M9; this read-side surface ships in M22).

---

## 8. Cross-cutting patterns

Conventions every clinical surface follows.

### 8.1 Virtualisation

Any `DataTable` reading >100 rows uses `@tanstack/react-virtual`. AQL results limited to `$limit` parameter; paging handled at the query level, not on the client.

### 8.2 Optimistic concurrency (If-Match / ETag)

Every COMPOSITION write includes the `If-Match` header with the last-read ETag. On 412 Precondition Failed the UI shows a **side-by-side diff modal** with their version vs the server's; clinician resolves by re-applying or aborting. (`conflict-dialog.tsx`, M6.)

### 8.3 Autosave drafts

Every write surface autosaves a FLAT draft into encrypted Valkey (24 h TTL, key bound to user+composition). On crash/disconnect/reload the draft restores. Drafts are NOT committed compositions — no audit event until submit.

### 8.4 Print / PDF (ADR-0020)

Tailwind `print:` variants on every patient-facing view. `page-break-before` / `page-break-inside: avoid` placed deliberately. v1.0 uses browser print; server-side PDF is v1.x.

### 8.5 Empty / loading / error states

Every surface ships three states:

- **Empty** — generic m.\* translated message + an explanation of what would populate the view ("Vitals will appear here once recorded for this patient").
- **Loading** — `Skeleton` shapes matching the populated layout; never a spinner alone.
- **Error** — `FeatureErrorBoundary` with correlation ID; never the raw error message (§10 rule 1 / Inviolable rule 2).

### 8.6 Terminology lookups

Every coded field (problem, allergy, medication, etc.) uses an autocomplete bound to Snowstorm (ADR-0022/0034). The autocomplete debounces 200 ms, caches per session, falls back to "search again" on failure (NEVER auto-substitutes a near match).

### 8.7 Role gating

Every clinical surface wraps its data fetch in `requireRole(...)` (the 7-persona set — ADR-0040). The M9 fine-grained gate additionally checks the care relationship; denial → 403 + `break-glass: available` when the user has a clinical role but no care relationship.

### 8.8 Audit — write lineage + IHE ATNA access trail (ADR-0041)

Every PHI access produces, via the BFF:

1. **Write lineage (native openEHR).** On a write, EHRbase records a `CONTRIBUTION` with `AUDIT_DETAILS` (`committer` derived from the forwarded token, `system_id`, `time_committed`, `change_type`, `description`). Signed content (note-signing, order-signing, CDS-override) records an `ATTESTATION`.
2. **Access trail (IHE ATNA, ours).** Every read / write / query fires the BFF `auditAccess(...)` helper → an IHE-ATNA-conformant DICOM AuditMessage (actor + role + purpose-of-use; patient/EHR + resource; action C/R/U/D/E; outcome) → the Postgres `audit` schema (+ optional syslog). EHRbase 2.x provides no read-access audit, so this is the app layer's responsibility (ADR-0043), built in M9.

CLAUDE.md Inviolable rule 11 enforces both. The audit-review dashboard + Article-15 log (M22) read trail (2).

### 8.9 i18n

Every label / empty-state / error message is a Paraglide `m.*` function. URL prefix is symmetric per locale (ADR-0014). v1.0 ships English; `nl` + EU locales land at the M24 release. Terminology displays show the locale-appropriate language label from Snowstorm where available; falls back to English.

### 8.10 Accessibility (§12)

Every surface is axe-clean at WCAG 2.2 AA + EN 301 549 + `target-size`. NVDA + VoiceOver passes per `docs/accessibility/manual-test-*.md`. Skip-link / focus rings / 24-px target size / focus-not-obscured all in M3 baseline.
