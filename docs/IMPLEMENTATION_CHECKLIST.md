# `ehrbase-ui` — Implementation Checklist

> Tracker for the v1.0 build-out. Mark `[x]` when shipped, `[~]` when in-flight, blank when not started.
>
> Sourced from [`docs/architecture.md`](architecture.md) v3.4. When the arch doc changes, this checklist follows. Every line cites the §-section in the arch doc that defines the deliverable.

## Milestone 1 — Foundation (this PR)

Scaffolds every tooling rail the later milestones plug into. No PHI-touching code lands here.

- [x] **1A** Repo skeleton + ADR seeding + `.claude/` setup — governance docs (`docs/governance/`) owned by 1O
- [x] **1B** TanStack Start + Tailwind v4 scaffold — §4, §6
- [x] **1C** shadcn init + first component batch — §6
- [x] **1D** ESLint v10 flat config + `jsx-a11y-x` + `@eslint-react` + `react-hooks` v7 — §12.3
- [x] **1E** Vitest + `vitest-axe` + Button axe baseline test — §12.4, §24
- [x] **1F** Playwright + `@axe-core/playwright` + smoke E2E — §12.4, §24
- [x] **1G** Paraglide JS init + `en.json` + first `m.*` call — §11
- [x] **1H** Storybook 10.4.1 + `addon-a11y` (diverges from arch doc 9.x — ADR-0010, verification passed) — §17
- [x] **1I** Pino app logger, stdout only (audit write path lands in M2) — §13.1
- [x] **1J** `orval` config + vendored EHRbase OpenAPI stub — §15
- [x] **1K** Dockerfile + docker-compose dev stack (EHRbase + Keycloak + Valkey + Postgres) + realm import — §18, §5.6
- [x] **1L** CI/CD: `ci.yml`, `security.yml`, `codeql.yml`, `dependency-review.yml`, `release.yml`, `dependabot.yml`, CODEOWNERS, PR + issue templates — §20 (semver-tag pinning per ADR-0011)
- [x] **1M** Pre-commit hooks via `husky` + `lint-staged` + `commitlint`
- [ ] **1N** `.claude/` — sub-agents, `.mcp.json`, project notes
- [x] **1O** ADR-0001 (stack) + ADR-0010 (storybook upgrade) + ADR-0011 (action pinning) ratified; PR template + CODEOWNERS shipped in 1L

## Milestone 2 — Auth + BFF + audit write core (§5, §14.2–14.5)

Single PR. The audit **write path** is built here (not stubbed) because
break-glass (§5.6) and the BFF proxy depend on a real `logAudit`. ADR-0002,
0003, 0004, 0005 ratified; ADR-0012 (app DB stack) + ADR-0013 (audit DB
append-only) added.

- [x] **2A** Audit DB infra — `platform-db` rename + `audit` DB/roles init, Drizzle client, schema, migration (append-only trigger + grants), `db:*` scripts — §14; ADR-0012/0013
- [x] **2B** Audit write core — `AuditEvent` schema (derived from the table), `logAudit`, pseudonymization, hash chain, durable store, integrity verifier — §14.2–14.5
- [x] **2C** Valkey session store — read / write / destroy helpers + sliding TTL — §5.3
- [x] **2D** OIDC login (PKCE + state), callback (token exchange + session set + audited LOGIN), `/api/auth/logout` (Keycloak end-session) — §5.4
- [x] **2E** `requireAuth` + silent refresh + idle 15 min / absolute 12 h timeouts — §5.5, §5.10
- [x] **2F** `requireRole(...)` (clinician / admin / audit-reviewer / researcher) + break-glass hint on PHI denials — §5.6
- [x] **2G** Security-headers middleware (per-request CSP nonce + `strict-dynamic` + HSTS + COOP/COEP + no-store on authed routes) — §5.7
- [x] **2H** CSRF defense (Origin check + single-use per-form token) — §5.8
- [x] **2I** Rate limiting via `rate-limiter-flexible` against Valkey (full §5.9 table) — §5.9
- [x] **2J** BFF EHRbase proxy — authed pass-through, request classification, §5.9 limit, per-call audit, 404/403 conflation — §5, §10, §14.3
- [x] **2K** Break-glass emergency-access flow — 60-min grant, 3/lifetime ceiling, fully audited — §5.6
- [x] **2L** Minimal authed UI (`/_authed` + `/me`) + sign-in control — §5
- [x] **2M** Source maps hidden in production (verified + documented) — §5.11
- [x] **2N** Tests (unit + gated full-stack E2E with audit-chain assertion), ADR ratification, checklist rewrite, secrets/env/compose/gitleaks wiring

## Milestone 3 — UI shell + i18n + state (§6, §9, §10, §11, §12)

- [x] App shell — sidebar (cookie state) + nav + theme toggle + `Command` palette
- [x] `ThemeProvider` with `localStorage` + no-flash inline script (next-themes — ADR-0014)
- [x] Error boundaries per feature area
- [x] TanStack Query global error → toast + correlation ID
- [x] Public `/accessibility` statement page — §12.8
- [x] `/me/access-log` scaffold (Art. 15 view; fed by the M4 governance milestone) — §14.8
- [x] Skip-to-content link, visible focus rings, `scroll-margin-top` for sticky headers — §12.6
- [~] Manual NVDA + VoiceOver test report under `docs/accessibility/` — §12.7 (report written 2026-05-27; NVDA/VoiceOver passes PENDING human run before v1.0, M8)

> **Milestones renumbered (2026-05-28).** v1.0 expanded from 8 to 18 milestones to reflect the full HIX-grade EPD scope on the openEHR open standard. See `docs/CLINICAL-UI.md` for the screen catalogue each new clinical milestone delivers, and the plan at `~/.claude/plans/i-want-you-to-fuzzy-curry.md` for the full rationale.

## Milestone 4 — Audit governance + retention (§14.6–14.12)

The audit **write path** (schema, `logAudit`, pseudonymization, hash chain, warm-tier persistence, integrity verifier) shipped in M2. This milestone owns the remaining **governance** chapter — distinct capabilities, each owned here:

- [ ] Cold storage tier: S3 Object Lock (WORM) + cross-region replication — §14.6
- [ ] Retention: configurable per national clinical-records law (default 20 y; e.g. NL WGBO, FR CSP R1112-7, DE §10 BO, AT ÄrzteG) + tagged purge job — §14.7
- [ ] Scheduled nightly hash-chain integrity job + DPO alerting (extends the M2 verifier) — §14.5
- [ ] DPIA template populated under `docs/compliance/` — §14.10
- [ ] DPA template populated — §14.1
- [ ] RoPA template populated — §14.1
- [ ] Breach response runbook — §14.9
- [ ] Patient-facing Art.15 `/me/access-log` data feed (UI scaffold from M3, fed here) — §14.8
- [ ] Audit-log integrity-check runbook

## Milestone 5 — Observability (§13)

> **Moved earlier (was M7).** The user-confirmed rationale: building observability into the foundation is cheaper than retrofitting; clinical UI surfaces in M8+ emit spans + logs from day one.

- [ ] OTel SDK bootstrap + sampling + PHI redaction layers — §13.2
- [ ] `pino-opentelemetry-transport` wiring — §13.1
- [ ] `/api/health` + `/api/ready` — §13.4
- [ ] OTel collector config in `docker-compose.yml`
- [ ] Tempo + Loki + Prometheus dev stack
- [ ] PHI-redaction layer verification + axe-equivalent automated test for span content

## Milestone 6 — openEHR engine (§7)

> **Was M5.** The form-rendering substrate every clinical write surface (M9–M16) depends on. No clinical UI ships before this; this ships before any clinical UI.

- [ ] Web-template fetch + cache (per archetype-catalogue ADR-0016) — §2, §7
- [ ] Zod schema generator from web template — §7 Validation
- [ ] `FieldRenderer` (rmType → shadcn map) — §7
- [ ] `ArrayFieldRenderer` (`useFieldArray` cardinality) — §7
- [ ] FLAT converter (write); STRUCTURED converter (read); CANONICAL converter (export)
- [ ] `DV_MULTIMEDIA` upload + ClamAV sidecar — §7.x file uploads
- [ ] Optimistic concurrency (If-Match ETag) + side-by-side diff modal — §7.x concurrent edits
- [ ] Autosave drafts → encrypted Valkey, 24-hour TTL — §7.x autosave
- [ ] `CompositionViewer` (STRUCTURED read-back) — §6
- [ ] CONTRIBUTION header population on every write (`openEHR-COMMITTER-NAME`, `-ID`, `-CHANGE-TYPE`, `-DESCRIPTION`) — ADR-0024
- [ ] Snowstorm terminology autocomplete wiring (ADR-0022)

## Milestone 7 — Demographic service (§2, ADR-0023)

> **NEW.** EHRbase implements only the EHR side — the demographic store is ours. v1.0 ships a separate openEHR-spec demographic service as a module in this app (own Postgres schema, own REST surface, own audit lines).

- [ ] Postgres schema `demographic` + roles (`demographic_owner`, `demographic_writer`) — ADR-0013 pattern
- [ ] PARTY hierarchy implementation: PERSON (concrete), PARTY_IDENTITY, CONTACT, ADDRESS, basic PARTY_RELATIONSHIP — `docs/CLINICAL-UI.md` §6
- [ ] `VERSIONED_OBJECT` semantics — every update creates a new version; prior versions readable by ID + version
- [ ] REST surface `/api/demographic/*` — GET / POST / PUT per the openEHR Demographic spec shape — ADR-0023
- [ ] Identifier-namespace registry for national patient IDs (NL: BSN, BE: NISS, FR: NIR, DE: KVNR, IT: Codice Fiscale, ES: TIS, PT: NUTS, AT: bPK, PL: PESEL, MRN)
- [ ] Pseudonymisation: HMAC-SHA256 with the shared `AUDIT_PSEUDONYM_SECRET` (matches §14.4 + ADR-0024 cross-link)
- [ ] EHRbase `EHR_STATUS.subject` populated as `PARTY_IDENTIFIED` with `external_ref` pointing at the demographic service
- [ ] Audit: `READ` / `CREATE` / `UPDATE` on `PARTY` resource type
- [ ] Admin UI: minimal patient-create flow (full UI in M15)

## Milestone 8 — Patient core (CLINICAL-UI.md §§7.1–7.4)

> **NEW.** The patient-bound layout + the three cross-cutting surfaces that lead to every other clinical screen.

- [ ] Patient header banner — layout component wrapping `/_authed/patients/$patientId/*`; reads M7 demographic + EHR `ehr_status` + summary AQL `patient_summary_header`
- [ ] Critical-allergy / critical-problem highlighting in the banner — CDS-state aware
- [ ] Break-glass hint when clinician not in care relationship — §5.6 wired into the banner
- [ ] Global patient search at `/_authed/patients/search` — hits M7 demographic + EHRbase existence check
- [ ] Recently-viewed list at `/_authed/patients/recent` — per-user app-DB table
- [ ] Encounter / visit list at `/_authed/patients/$patientId/encounters` — AQL over `DIRECTORY/FOLDER` per encounter
- [ ] Role-specific home (`/_authed/home` resolves per ADR-0017) — physician / nurse / admin / audit-reviewer / researcher
- [ ] First-login role picker at `/_authed/role-picker` for multi-role users
- [ ] Storybook stories for banner + each home variant
- [ ] E2E: physician home renders today's ward; switching role works; deep link to a patient survives login

## Milestone 9 — Vitals + labs (CLINICAL-UI.md §§7.5–7.6)

> **NEW.** The highest-frequency clinical read surface in inpatient workflow.

- [ ] Vitals flowsheet at `/_authed/patients/$patientId/vitals` — custom `VitalsFlowsheet` grid + Recharts `LineChart` per archetype (ADR-0018)
- [ ] Vitals quick-entry drawer (nurse-led) — writes `OBSERVATION` compositions per archetype (blood_pressure.v2, pulse.v2, body_temperature.v2, respiration.v2, pulse_oximetry.v1, body_weight.v2, height.v2, body_mass_index.v2) — ADR-0016
- [ ] AQL queries: `vitals_latest_*` + `vitals_trend_*` per archetype — added to `docs/aql-catalogue.md`
- [ ] CDS rule `cds_005_critical_bp` (ADR-0021) wired into vitals write path
- [ ] Lab results timeline at `/_authed/patients/$patientId/labs` — `DataTable` + Recharts trend chart
- [ ] Abnormal-flag highlighting via reference-range comparison (per LOINC code from Snowstorm)
- [ ] LOINC autocomplete (Snowstorm) for ad-hoc lab data entry
- [ ] CDS rule `cds_006_critical_lab` + `cds_003_renal_dose_adjust` wired
- [ ] Dual-layer audit (CONTRIBUTION + `logAudit`) on every write — ADR-0024
- [ ] Storybook stories for flowsheet, trend chart, abnormal-flag badge
- [ ] E2E: record vitals → flowsheet updates; lab abnormal flag renders; CDS critical-BP alert fires

## Milestone 10 — Clinical notes (CLINICAL-UI.md §7.7)

> **NEW.** The highest-volume clinical write surface.

- [ ] `NoteEditor` component — TipTap-based rich text + structured-field slots
- [ ] SOAP layout via openEHR `SECTION` — Subjective / Objective / Assessment / Plan blocks
- [ ] Note-type variants — admission note, progress note, discharge prep, nurse note (role-gated)
- [ ] Save as `openEHR-EHR-COMPOSITION.encounter.v1` + `EVALUATION.clinical_synopsis.v1`
- [ ] Sign vs save-draft semantics — signing produces the dual-layer audit (ADR-0024); draft stays in Valkey (24 h TTL)
- [ ] Autosave every 30 s + on blur; restore on page-reload
- [ ] Optimistic concurrency on signed-note edits (If-Match ETag, M6 substrate)
- [ ] AQL query `notes_recent_compositions`
- [ ] Storybook + E2E: type a note, sign it, reload, the note appears in encounter list

## Milestone 11 — Problems + medications + allergies + immunisations (CLINICAL-UI.md §§7.8–7.11)

> **NEW.** The persistent patient-summary surface — top of every patient view.

- [ ] Combined route `/_authed/patients/$patientId/problems` with tabs (problems / meds / allergies / immunisations)
- [ ] Problem list — `EVALUATION.problem_diagnosis.v1`, SNOMED CT-coded via Snowstorm — `DataTable`, `Sheet` for add/edit
- [ ] Medication active list — `INSTRUCTION.medication_order.v3` + `ACTION.medication.v1` — custom `MedicationCard`
- [ ] Allergies — `EVALUATION.adverse_reaction_risk.v1`, severity Badge, SNOMED CT-coded
- [ ] Immunisations — `ACTION.immunisation.v1`, timeline view, SNOMED CT vaccine codes
- [ ] CDS rule `cds_001_drug_allergy_match` fires on prescribe + on allergy-write
- [ ] CDS rule `cds_010_allergy_severity_unknown` suggests follow-up
- [ ] AQL queries: `problems_active`, `problems_history`, `medications_active`, `medication_administrations_recent`, `allergies_active`, `immunisations_history`
- [ ] Banner-summary feed updated (active allergies count, active problems count)
- [ ] Storybook + E2E covering each tab

## Milestone 12 — Orders / CPOE (CLINICAL-UI.md §7.12)

> **NEW.** Computerised order entry — meds / labs / imaging. Built on M6 form engine + M11 med/allergy data for safety checks.

- [ ] Orders route `/_authed/patients/$patientId/orders`
- [ ] Order types: medication (`INSTRUCTION.medication_order.v3`), lab (`INSTRUCTION.laboratory_test_order.v1`), imaging (`INSTRUCTION.imaging_examination_request.v1`) — ADR-0019
- [ ] Fulfilment records: `ACTION.medication.v1`, `ACTION.procedure.v1`
- [ ] Order sets via openEHR PROC `TASK_PLAN.order_set_id` — ADR-0025
- [ ] `OrderSetPicker` component + `DataTable` for pending/active/completed
- [ ] Workflow-id linking on writes (INSTRUCTION ↔ ACTION cross-ref)
- [ ] CDS rules `cds_001` (drug-allergy), `cds_002` (drug-drug, with built-in top-20 high-severity table), `cds_007` (duplicate order), `cds_008` (anticoagulant-INR), `cds_009` (pregnancy contraindication) — ADR-0021
- [ ] Dismiss-with-justification flow on critical CDS alerts → `EVALUATION.cds_override.v0` + NEN-7513 `CDS_OVERRIDE` audit
- [ ] AQL queries: `orders_pending`, `orders_recent_completed`
- [ ] FHIR `MedicationRequest` / `ServiceRequest` export transformer (one-way, M12 ships a minimal set) — ADR-0019
- [ ] Storybook + E2E: prescribe a med that triggers an allergy alert; dismiss with justification; audit trail correct

## Milestone 13 — Care plan + tasks (CLINICAL-UI.md §7.13)

> **NEW.** The interdisciplinary care-team surface. Nurse home pulls from here.

- [ ] Care plan route `/_authed/patients/$patientId/care-plan`
- [ ] Tree view of `WORK_PLAN` → `TASK_PLAN` → `PLAN_ITEM` — openEHR PROC component, ADR-0025
- [ ] Task completion writes `ACTION.care_plan.vN` with `workflow_id` linking back to `PLAN_ITEM`
- [ ] References to external `care_pathway` / `guideline` / `best_practice_ref` (display + link only)
- [ ] AQL queries: `care_plan_active_tasks`, `care_plan_tasks_overdue` (overdue surfaces on nurse home dashboard)
- [ ] Goal tracking + outcome-measure recording (small subset — full goal model is v1.x)
- [ ] Storybook + E2E: nurse closes a task, the plan tree updates, the care-plan ACTION composition lands in EHRbase

## Milestone 14 — AQL editor + data tables (§8)

> **Was M6.** Power-user surface — researcher + audit-reviewer. Moved later because daily clinicians don't author AQL.

- [ ] `@uiw/react-codemirror` wrapper with AQL grammar highlighting — AQL Release 1.1.0 spec
- [ ] AQL autocomplete schema for the main RM classes (`EHR`, `COMPOSITION`, `OBSERVATION`, …) + the v1.0 archetype catalogue (ADR-0016)
- [ ] Stored-query persistence — `docs/aql-catalogue.md` model
- [ ] Result table via shadcn `data-table` + `@tanstack/react-table`
- [ ] Virtualized rows > 500 via `@tanstack/react-virtual`
- [ ] Query export (CSV / JSON) — rate-limited per §5.9
- [ ] Stricter `aql-complex` rate limit applied per §5.9
- [ ] Storybook + E2E: write an AQL query, save it, run it, see virtualised results

## Milestone 15 — Admin UI + audit-review UI + CDS rule authoring (CLINICAL-UI.md §§7.15–7.17)

> **NEW.** Admin surface ships here — user / role management, audit-review dashboard (§14.13 implementation), CDS rule authoring.

- [ ] User / role management at `/_authed/admin/users` — proxies Keycloak admin API via BFF
- [ ] Audit-review dashboard at `/_authed/admin/audit` — sample-of-60 review queue, drill-down drawer, mark-reviewed action — §14.13
- [ ] Audit-review meta-audit: reviewer access produces `META_AUDIT_ACCESS` events
- [ ] CDS rule authoring at `/_authed/admin/cds-rules` — form-based UI (not raw GDL2 syntax) over the GDL2-aligned internal format — ADR-0021
- [ ] CDS rule activation toggle + dry-run preview (evaluate rule against current data without writing)
- [ ] Rule-change audit (`ADMIN_CHANGE` action on create/update/disable)
- [ ] Storybook stories for the admin surfaces + the CDS rule editor

## Milestone 16 — Discharge + referrals + document viewer + print/PDF + CDS runtime (CLINICAL-UI.md §§7.18–7.20, ADR-0020)

> **NEW.** Outbound clinical documents + inbound document display + the runtime CDS evaluator that wires the M15 rule authoring into composition writes.

- [ ] Discharge summary editor at `/_authed/patients/$patientId/documents/discharge` — assembles from existing data (problems / meds / recent results) into `openEHR-EHR-COMPOSITION.discharge_summary.v1`
- [ ] Referral letter editor at `/_authed/patients/$patientId/documents/referrals` — `openEHR-EHR-COMPOSITION.referral.v0`
- [ ] Document viewer at `/_authed/patients/$patientId/documents` — PDF.js + image viewer
- [ ] DICOM study listing + external-PACS-viewer launch link (no embedded DICOM in v1.0) — ADR-0020
- [ ] Print/PDF via Tailwind `print:` + page-break utilities; print-only header with `{patient | DOB | MRN | doc title | date}` — ADR-0020
- [ ] CDS runtime evaluator in the BFF — loads rules from the M15 DB, evaluates on composition write, fires alerts per ADR-0021
- [ ] Dismiss-with-justification flow generic to any CDS rule (M12 implements for orders; M16 generalises)
- [ ] Storybook + E2E: print preview renders correctly; DICOM list shows external-launch button; CDS rule fires on note submission

## Milestone 17 — Messaging + decision support surfaces (CLINICAL-UI.md §7.21)

> **NEW.** Inbox + lab-alert + reminder surfaces. Last clinical milestone because it depends on every prior surface's data.

- [ ] Inbox at `/_authed/inbox` — `DataTable` of threads + `Sheet` per thread
- [ ] Lab-result alert generation (when a result lands abnormal and CDS rule `cds_006_critical_lab` triggers, drop into inbox)
- [ ] Referral-response inbox messages (when a referral comes back from M16's referral surface)
- [ ] Internal messages — non-openEHR, app-DB tables (workflow, not clinical data)
- [ ] CDS-alert acknowledgement audit trail
- [ ] Reminder surface on patient banner — when CDS rules with severity=info fired at last write, display as a non-blocking banner badge
- [ ] Audit: `READ` on `MESSAGE` (custom resource type), purpose `TREATMENT` when patient-linked
- [ ] Storybook + E2E covering inbox + lab-alert + reminder flows

## Milestone 18 — Hardening + release (§19, §21, §22, §25, §26)

> **Was M8.** v1.0 tag.

- [ ] Secrets via env / Doppler — never committed — §19
- [ ] Backup + DR drill runbook — §21
- [ ] Performance budgets enforced in CI (Lighthouse) — §22
- [ ] Browser-support soft-block page — §23
- [ ] Quarterly DR drill scheduled — §21
- [ ] Manual NVDA + VoiceOver pre-tag pass over every clinical surface — §12.7
- [ ] `/accessibility` conformance statement signed — §12.8
- [ ] DPIA legal sign-off — §14.10
- [ ] Penetration test
- [ ] Clinical reviewer sign-off on `docs/CLINICAL-UI.md` — domain SME confirms user journeys + archetype choices match real ward / clinic workflow
- [ ] Tag `v1.0.0`

---

## Conventions

- Strikethrough (`~~`) items are deferred deliberately (see §1 "Explicitly NOT in v1.0").
- When you tick a box, link the PR that completed it: `- [x] **1A** Repo skeleton ([#42](…))`.
- New items added during build-out land at the end of the relevant milestone with a date, e.g. `- [ ] (added 2026-06-10) …`.
