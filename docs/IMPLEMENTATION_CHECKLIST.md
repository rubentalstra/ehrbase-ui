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

## Milestone 0 — Monorepo migration (Phase 0, lands before M5)

> **NEW.** Restructures the repo as a Turborepo + pnpm-workspaces monorepo per ADR-0030. Every file moves verbatim (no rewrites). Critical pre-requisite for M5+ — every clinical milestone (M10+) lands code into the existing package layout instead of re-shuffling per-milestone. ADRs 0030–0034 ratify the structural decisions.

- [ ] pnpm-workspace.yaml + turbo.json + root package.json + root tsconfig.json with project references — ADR-0030
- [ ] Config packages: `@ehrbase-ui/config-tsconfig`, `config-eslint`, `config-tailwind`
- [ ] App move: `src/` → `apps/web/src/`; `public/`, `e2e/`, `messages/`, vitest + playwright configs follow
- [ ] Platform packages extracted: `audit`, `auth`, `http-bff`, `observability` (with `log/`), `valkey`, `db-platform`, `i18n`
- [ ] openEHR per-spec packages scaffolded (empty + index.ts only): `openehr-base`, `-rm`, `-am`, `-aql`, `-proc`, `-cds`, `-term`, `-its-rest` (current generated stub moves here), `-flat`, `-web-template` — ADR-0032
- [ ] Demographic provider scaffold: `demographic-core`, `demographic-adapter-fhir` (empty packages with provider interface stub) — ADR-0031
- [ ] Terminology provider scaffold: `term-core`, `term-adapter-snowstorm` (empty packages with provider interface stub) — ADR-0034
- [ ] UI package: `packages/ui` — current `src/components/ui/*` shadcn primitives move here
- [ ] All imports updated to `@ehrbase-ui/*`; `apps/web/package.json` depends on workspace packages via `workspace:*`
- [ ] ADR-0030 (monorepo) + ADR-0031 (pluggable demographic) + ADR-0032 (openEHR per-spec) + ADR-0033 (FHIR R4 adapter scope) + ADR-0034 (pluggable terminology) ratified
- [ ] ADR-0021 (CDS) + ADR-0022 (terminology) + ADR-0023 (demographic) amended
- [ ] Inviolable rule 13 added to CLAUDE.md
- [ ] CLINICAL-UI.md + architecture.md cross-refs updated for new milestone numbering + monorepo paths
- [ ] `pnpm install && pnpm turbo run build typecheck lint test e2e` green; dev workflow regression-free; pre-commit hooks fire from root

## Milestone 3 — UI shell + i18n + state (§6, §9, §10, §11, §12)

- [x] App shell — sidebar (cookie state) + nav + theme toggle + `Command` palette
- [x] `ThemeProvider` with `localStorage` + no-flash inline script (next-themes — ADR-0014)
- [x] Error boundaries per feature area
- [x] TanStack Query global error → toast + correlation ID
- [x] Public `/accessibility` statement page — §12.8
- [x] `/me/access-log` scaffold (Art. 15 view; fed by the M4 governance milestone) — §14.8
- [x] Skip-to-content link, visible focus rings, `scroll-margin-top` for sticky headers — §12.6
- [~] Manual NVDA + VoiceOver test report under `docs/accessibility/` — §12.7 (report written 2026-05-27; NVDA/VoiceOver passes PENDING human run before v1.0, M8)

> **Milestones renumbered (2026-05-28; further consolidated 2026-05-29).** v1.0 grew from 8 to 18 to **19** milestones to reflect the full HIX-grade EPD scope on the openEHR open standard. The 2026-05-29 re-org consolidates two previously-split capabilities into single milestones (M7 demographic absorbs the full admin demographic UI that was originally scheduled for M15; CDS is consolidated from M9/M15/M16 into a new M9) per CLAUDE.md Inviolable rule 13. The plan at `~/.claude/plans/okay-now-i-want-delightful-reddy.md` records the full rationale + the monorepo migration that lands in Milestone 0.

## Milestone 4 — Audit governance + retention (§14.6–14.12)

The audit **write path** (schema, `logAudit`, pseudonymization, hash chain, warm-tier persistence, integrity verifier) shipped in M2. This milestone owns the remaining **governance** chapter — distinct capabilities, each owned here:

- [x] Cold storage tier: ColdStorageProvider abstraction (SeaweedFS dev-default best-effort + AWS S3 Object Lock WORM) — §14.6, ADR-0027
- [x] Retention: configurable per national clinical-records law (default 20 y; e.g. NL WGBO, FR CSP R1112-7, DE §10 BO, AT ÄrzteG) + tagged purge job — §14.7
- [x] Scheduled nightly hash-chain integrity job + DPO alerting (extends the M2 verifier; Nitro task ADR-0026) — §14.5
- [x] DPIA template populated under `docs/compliance/` — §14.10
- [x] DPA template populated — §14.1
- [x] RoPA template populated — §14.1
- [x] Breach response runbook — §14.9
- [x] Patient-facing Art.15 `/me/access-log` data feed (UI scaffold from M3, fed here) — §14.8
- [x] Audit-log integrity-check runbook

## Milestone 5 — Observability (§13)

> **Moved earlier.** Building observability into the foundation is cheaper than retrofitting; clinical UI surfaces in M8+ emit spans + logs from day one. Lands in `apps/web/src/server/observability/` + `apps/web/src/instrumentation.ts` + `apps/web/src/routes/api/{health,ready}.ts`.
>
> **Stack simplification (2026-05-29, ADR-0035 + ADR-0036).** The `db-platform`/`audit`/`auth`/`observability`/`http-bff` packages were collapsed into `apps/web/src/server/*` (no external consumers); Drizzle migrations collapsed to one `db:migrate`; and the bespoke Keycloak `kcadm` shell scripts (realm import + grafana-client sync + demo-user seed) were replaced by one declarative `keycloak-config-cli` container. One-shot containers: 4 → 3.

- [x] OTel SDK bootstrap + sampling + PHI redaction layers — §13.2 (ADR-0009)
- [x] `pino-opentelemetry-transport` wiring — §13.1
- [x] `/api/health` + `/api/ready` — §13.4 (probes Valkey + EHRbase + Keycloak + audit DB + auth DB)
- [x] OTel collector config in `docker-compose.yml` — `otel/opentelemetry-collector-contrib:0.153.0` (web-reverified 2026-05-29)
- [x] Tempo (`3.0.0`) + Loki (`3.7.2`) + Prometheus (`v3.12.0`) + Grafana (`grafana-oss:13.0.1` + Keycloak SSO) dev stack
- [x] PHI-redaction layer verification (unit tests for layers 1 + 2; collector layers 3 + 4 in `apps/web/docker/otel/collector-config.yaml`)

## Milestone 5.5 — openEHR Spec Foundation (`packages/openehr-*`)

> **NEW (2026-05-30).** Builds out all 10 `packages/openehr-*` packages fully — the type/format/grammar data layer every clinical milestone (M6–M19) consumes. Pinned to **EHRbase 2.31.0 reality** (RM 1.1.0 + BASE 1.1.0 + ADL 1.4), not the newest spec — see the ADR-0032 addendum (2026-05-30). Delivered as 4 dependency-tiered PRs. Plan: `~/.claude/plans/okay-now-i-want-generic-sedgewick.md`.
>
> **Future-version ready:** every package ships a `spec.json` manifest, version-namespaced `src/generated/<v>/` + `current.ts`, a stable hand-written facade over generated types, `SPEC_VERSION` export, Zod-codec wire boundary, and a runtime RM-version guard — so a future spec bump is additive, never a rewrite.

**Pin realignment (governance — Inviolable rule 5):**

- [x] ADR-0032 addendum: pin-to-EHRbase policy + corrected pins (BASE 1.2.0→1.1.0, AM 2.3.0→ADL 1.4)
- [x] CLAUDE.md "Versions" + `docs/REFERENCES.md` updated to match
- [ ] Empirical RM/BASE/ADL confirmation off the running dev EHRbase 2.31.0 stack

**PR-1 — `openehr-base` (BASE 1.1.0) + shared regen tooling:**

- [ ] Shared regen pipeline: fetch ITS-JSON schemas, rewrite absolute `$ref`s → local, bundle, `json-schema-to-zod`; reads per-package `spec.json`
- [ ] Future-version primitives established on `openehr-base` (manifest, version-namespaced output, facade, `SPEC_VERSION`)
- [ ] ESLint `no-restricted-imports` rule banning `ehrtslib` / `medblocks-ui` / `@bpac/openehr-models` / `@mmt_d/mmt-openehr-types` — ADR-0032
- [ ] `openehr-base` facade + foundational helpers (`Interval<T>`, `Iso8601_*`, identifiers, polymorphic `LOCATABLE_REF.id` stitch) + Vitest round-trip; `typecheck`/`test` scripts green via turbo

**PR-2 — `openehr-rm` (RM 1.1.0):**

- [ ] Generate RM 1.1.0 Zod types; hand-stitch abstract classes (`LOCATABLE`, `DATA_VALUE`, `EVENT<T>`, …)
- [ ] ADR-0016 catalogue round-trip harness — every v1.0 archetype round-trips (release-blocking gate)

**PR-3 — data/format layer:** `openehr-its-rest` (EHRbase 2.31.0 OpenAPI via orval), `openehr-web-template` (parser + Zod generator), `openehr-flat` (FLAT↔canonical converter), `openehr-am` (minimal ADL 1.4 / OPT subset)

**PR-4 — query/clinical layer:** `openehr-aql` (AST + builder + serializer), `openehr-term` (openEHR code sets), `openehr-proc` (Task Planning model), `openehr-cds` (GDL2-aligned rule-authoring model)

- [ ] CI: `pnpm regen --check` green (drift gate); no third-party openEHR SDK on the dep graph

## Milestone 6 — openEHR form engine (§7)

> The form-rendering substrate every clinical write surface (M10–M15) depends on. Lands across `packages/openehr-{base,rm,its-rest,flat,web-template}` + `packages/ui/src/components/openehr/*` + app-internal `apps/web/src/lib/openehr/*`.

- [ ] Web-template fetch + cache (per archetype-catalogue ADR-0016) — §2, §7
- [ ] Zod schema generator from web template — §7 Validation
- [ ] `FieldRenderer` (rmType → shadcn map) — §7
- [ ] `ArrayFieldRenderer` (`useFieldArray` cardinality) — §7
- [ ] FLAT converter (write); STRUCTURED converter (read); CANONICAL converter (export) — `packages/openehr-flat`
- [ ] `DV_MULTIMEDIA` upload + ClamAV sidecar (`clamav/clamav:1.5-debian`) — §7.x file uploads
- [ ] Optimistic concurrency (If-Match ETag) + side-by-side diff modal — §7.x concurrent edits
- [ ] Autosave drafts → encrypted Valkey, 24-hour TTL — §7.x autosave
- [ ] `CompositionViewer` (STRUCTURED read-back) — §6
- [ ] CONTRIBUTION header population on every write (`openEHR-COMMITTER-NAME`, `-ID`, `-CHANGE-TYPE`, `-DESCRIPTION`) — ADR-0024
- [ ] Terminology autocomplete wiring via `@ehrbase-ui/term-core` (ADR-0034) — pluggable Snowstorm default

## Milestone 7 — Demographic service (pluggable provider; ADR-0031)

> **NEW.** EHRbase only implements the EHR side. Demographic provider is pluggable — built-in Postgres adapter (default) + FHIR R4 adapter both ship in M7. ADR-0031 supersedes ADR-0023 in shape. Per Inviolable rule 13, the full demographic admin UI ships in M7 (previously split with M15).

- [ ] `DemographicProvider` interface in `packages/demographic-core` — ADR-0031
- [ ] Built-in adapter: Postgres `demographic` schema + roles (`demographic_owner`, `demographic_writer`) on `platform-db` — ADR-0013 pattern, in `packages/db-platform`
- [ ] PARTY hierarchy implementation: PERSON, PARTY_IDENTITY, CONTACT, ADDRESS, ROLE, basic PARTY_RELATIONSHIP — types from `@ehrbase-ui/openehr-rm` (ADR-0032)
- [ ] VERSIONED_PARTY semantics — every update writes a new row; prior versions readable
- [ ] REST surface `/api/demographic/*` in `apps/web/src/routes/api/demographic/`
- [ ] FHIR R4 adapter: `packages/demographic-adapter-fhir` — version-aware (R4 only for v1.0; R5/R6 pure-additive per ADR-0033)
- [ ] Capability flags (`capabilities.readonly` etc.) drive admin UI gating
- [ ] Identifier-namespace registry: NL (BSN, 11-proef), BE (NISS, mod-97), FR (NIR), DE (KVNR), IT (CF), ES (TIS), PT (NUTS), AT (bPK), PL (PESEL, 11-digit), MRN
- [ ] Pseudonymisation: HMAC-SHA256 with the shared `AUDIT_PSEUDONYM_SECRET` (matches §14.4 + ADR-0024)
- [ ] EHRbase `EHR_STATUS.subject` populated as `PARTY_IDENTIFIED` with `external_ref` pointing through the provider
- [ ] Audit: `READ` / `CREATE` / `UPDATE` / `MERGE_PARTY` on `PARTY` resource type; `source.adapterName` recorded
- [ ] **Full demographic admin UI** at `/_authed/admin/patients/*` — create + edit + identifiers + relationships + deactivate + merge + version-history (capability-gated against the active provider)
- [ ] Storybook + E2E: built-in adapter golden-path; FHIR adapter read-only path

## Milestone 8 — Patient core + workspace shell (CLINICAL-UI.md §§7.1–7.4)

> The patient-bound layout + cross-cutting surfaces that lead to every other clinical screen. Reads M7 `DemographicProvider` directly (works against built-in OR FHIR adapter).

- [ ] Patient header banner — layout component wrapping `/_authed/patients/$patientId/*`; reads M7 provider + EHR `ehr_status` + summary AQL `patient_summary_header`
- [ ] Critical-allergy / critical-problem highlighting in the banner — CDS-state aware (data from M9)
- [ ] Break-glass hint when clinician not in care relationship — §5.6 wired into the banner
- [ ] Global patient search at `/_authed/patients/search` — hits M7 provider + EHRbase existence check
- [ ] Recently-viewed list at `/_authed/patients/recent` — per-user `auth` DB table (new tiny schema in `packages/db-platform`)
- [ ] Encounter / visit list at `/_authed/patients/$patientId/encounters` — AQL over `DIRECTORY/FOLDER`
- [ ] Role-specific home (`/_authed/home` resolves per ADR-0017) — physician / nurse / admin / audit-reviewer / researcher
- [ ] First-login role picker at `/_authed/role-picker` for multi-role users
- [ ] Storybook stories for banner + each home variant
- [ ] E2E: physician home renders today's ward; switching role works; deep link to a patient survives login

## Milestone 9 — CDS infrastructure + rule authoring + runtime (CLINICAL-UI.md §7.17, ADR-0021)

> **NEW.** CDS consolidated from old M9/M15/M16 fragmentation per Inviolable rule 13. Ships rule schema + form-based authoring UI + runtime evaluator at the BFF + generic dismiss-with-justification flow + the v1.0 10-rule pack. All subsequent clinical write surfaces (M10–M14) wire their rules to this runtime.

- [ ] `@ehrbase-ui/openehr-cds` — `CdsRule` schema (GDL2-aligned, ADR-0021)
- [ ] CDS rule storage in `auth`-pattern Postgres schema + Drizzle migrations in `packages/db-platform`
- [ ] CDS rule authoring at `/_authed/admin/cds-rules` — form-based UI over the JSON rule format (NOT raw GDL2 syntax); uses M6 form engine for archetype-path binding pickers
- [ ] CDS rule activation toggle + dry-run preview (evaluate against current data without writing)
- [ ] Runtime evaluator in the BFF — loads active rules on startup, evaluates on every composition write
- [ ] Severity handling: `info` (banner), `warning` (modal, dismissible), `critical` (block until dismissed-with-justification)
- [ ] Generic dismiss-with-justification flow → `EVALUATION.cds_override.v0` composition + NEN-7513 `CDS_OVERRIDE` audit (dual-layer)
- [ ] Initial 10-rule pack seeded: `cds_001`–`cds_010` (drug-allergy, drug-drug top-20, renal-dose, paediatric-weight, critical-BP, critical-lab, duplicate-order, anticoagulant-INR, pregnancy-contra, allergy-severity-unknown)
- [ ] Rule-change audit (`ADMIN_CHANGE` on create/update/disable)
- [ ] Storybook stories for the rule editor + alert components
- [ ] E2E: author a rule, dry-run, activate, write a composition that triggers it, dismiss with justification, verify dual-layer audit lands

## Milestone 10 — Vitals + labs (CLINICAL-UI.md §§7.5–7.6)

> The highest-frequency clinical read surface in inpatient workflow. CDS rules (`cds_005`, `cds_006`, `cds_003`) now resolvable end-to-end via M9 runtime.

- [ ] Vitals flowsheet at `/_authed/patients/$patientId/vitals` — custom `VitalsFlowsheet` grid + Recharts `LineChart` per archetype (ADR-0018)
- [ ] Vitals quick-entry drawer (nurse-led) — writes `OBSERVATION` per archetype (blood_pressure.v2, pulse.v2, body_temperature.v2, respiration.v2, pulse_oximetry.v1, body_weight.v2, height.v2, body_mass_index.v2) — ADR-0016
- [ ] AQL queries: `vitals_latest_*` + `vitals_trend_*` per archetype — added to `docs/aql-catalogue.md`
- [ ] CDS rule `cds_005_critical_bp` wired via M9 runtime
- [ ] Lab results timeline at `/_authed/patients/$patientId/labs` — `DataTable` + Recharts trend chart
- [ ] Abnormal-flag highlighting via reference-range comparison (per LOINC code from terminology provider)
- [ ] LOINC autocomplete via `@ehrbase-ui/term-core` (ADR-0034)
- [ ] CDS rules `cds_006_critical_lab` + `cds_003_renal_dose_adjust` wired via M9
- [ ] Dual-layer audit (CONTRIBUTION + `logAudit`) on every write — ADR-0024
- [ ] Storybook stories for flowsheet, trend chart, abnormal-flag badge
- [ ] E2E: record vitals → flowsheet updates; lab abnormal flag renders; CDS critical-BP alert fires (via M9 runtime)

## Milestone 11 — Clinical notes (CLINICAL-UI.md §7.7)

> The highest-volume clinical write surface. CDS evaluation on submit goes through the M9 generic flow.

- [ ] `NoteEditor` component — TipTap-based rich text + structured-field slots (in `packages/ui`)
- [ ] SOAP layout via openEHR `SECTION` — Subjective / Objective / Assessment / Plan blocks
- [ ] Note-type variants — admission note, progress note, discharge prep, nurse note (role-gated)
- [ ] Save as `openEHR-EHR-COMPOSITION.encounter.v1` + `EVALUATION.clinical_synopsis.v1`
- [ ] Sign vs save-draft semantics — signing produces the dual-layer audit (ADR-0024); draft stays in Valkey (24 h TTL)
- [ ] Autosave every 30 s + on blur; restore on page-reload
- [ ] Optimistic concurrency on signed-note edits (If-Match ETag, M6 substrate)
- [ ] AQL query `notes_recent_compositions`
- [ ] M9 runtime evaluates note submission for CDS rules
- [ ] Storybook + E2E: type a note, sign it, reload, the note appears in encounter list

## Milestone 12 — Problems + medications + allergies + immunisations (CLINICAL-UI.md §§7.8–7.11)

> Persistent patient-summary surface. CDS rules `cds_001` + `cds_010` fire via M9 runtime.

- [ ] Combined route `/_authed/patients/$patientId/problems` with tabs (problems / meds / allergies / immunisations)
- [ ] Problem list — `EVALUATION.problem_diagnosis.v1`, SNOMED CT-coded via terminology provider — `DataTable`, `Sheet` for add/edit
- [ ] Medication active list — `INSTRUCTION.medication_order.v3` + `ACTION.medication.v1` — custom `MedicationCard`
- [ ] Allergies — `EVALUATION.adverse_reaction_risk.v1`, severity Badge, SNOMED CT-coded
- [ ] Immunisations — `ACTION.immunisation.v1`, timeline view, SNOMED CT vaccine codes
- [ ] CDS rule `cds_001_drug_allergy_match` fires on prescribe + on allergy-write (via M9)
- [ ] CDS rule `cds_010_allergy_severity_unknown` suggests follow-up (via M9)
- [ ] AQL queries: `problems_active`, `problems_history`, `medications_active`, `medication_administrations_recent`, `allergies_active`, `immunisations_history`
- [ ] Banner-summary feed updated (active allergies count, active problems count)
- [ ] Storybook + E2E covering each tab

## Milestone 13 — Orders / CPOE (CLINICAL-UI.md §7.12)

> Computerised order entry. Dismiss-with-justification reuses the M9 generic flow (no per-milestone re-implementation).

- [ ] Orders route `/_authed/patients/$patientId/orders`
- [ ] Order types: medication (`INSTRUCTION.medication_order.v3`), lab (`INSTRUCTION.laboratory_test_order.v1`), imaging (`INSTRUCTION.imaging_examination_request.v1`) — ADR-0019
- [ ] Fulfilment records: `ACTION.medication.v1`, `ACTION.procedure.v1`
- [ ] Order sets via `@ehrbase-ui/openehr-proc` `TASK_PLAN.order_set_id` — ADR-0025
- [ ] `OrderSetPicker` component + `DataTable` for pending/active/completed
- [ ] Workflow-id linking on writes (INSTRUCTION ↔ ACTION cross-ref)
- [ ] CDS rules `cds_001`, `cds_002`, `cds_007`, `cds_008`, `cds_009` wired via M9 runtime
- [ ] Critical alerts blocked until dismiss-with-justification (M9 generic flow)
- [ ] AQL queries: `orders_pending`, `orders_recent_completed`
- [ ] FHIR `MedicationRequest` / `ServiceRequest` export transformer (one-way) — ADR-0019
- [ ] Storybook + E2E: prescribe a med that triggers an allergy alert; dismiss with justification; audit trail correct

## Milestone 14 — Care plan + tasks (CLINICAL-UI.md §7.13)

> The interdisciplinary care-team surface. Nurse home pulls from here.

- [ ] Care plan route `/_authed/patients/$patientId/care-plan`
- [ ] Tree view of `WORK_PLAN` → `TASK_PLAN` → `PLAN_ITEM` — `@ehrbase-ui/openehr-proc`, ADR-0025
- [ ] Task completion writes `ACTION.care_plan.vN` with `workflow_id` linking back to `PLAN_ITEM`
- [ ] References to external `care_pathway` / `guideline` / `best_practice_ref` (display + link only)
- [ ] AQL queries: `care_plan_active_tasks`, `care_plan_tasks_overdue` (overdue surfaces on nurse home dashboard)
- [ ] Goal tracking + outcome-measure recording (small subset — full goal model is v1.x)
- [ ] Storybook + E2E: nurse closes a task, the plan tree updates, the care-plan ACTION composition lands in EHRbase

## Milestone 15 — Discharge + referrals + document viewer + print/PDF (CLINICAL-UI.md §§7.18–7.20, ADR-0020)

> Outbound clinical documents + inbound document display. CDS runtime moved to M9; this milestone owns document outputs only.

- [ ] Discharge summary editor at `/_authed/patients/$patientId/documents/discharge` — assembles from existing data (problems / meds / recent results) into `openEHR-EHR-COMPOSITION.discharge_summary.v1`
- [ ] Referral letter editor at `/_authed/patients/$patientId/documents/referrals` — `openEHR-EHR-COMPOSITION.referral.v0`
- [ ] Document viewer at `/_authed/patients/$patientId/documents` — PDF.js + image viewer
- [ ] DICOM study listing + external-PACS-viewer launch link (no embedded DICOM in v1.0) — ADR-0020
- [ ] Print/PDF via Tailwind `print:` + page-break utilities; print-only header with `{patient | DOB | MRN | doc title | date}` — ADR-0020
- [ ] M9 runtime evaluates each document submission for CDS rules (no new code here)
- [ ] Storybook + E2E: print preview renders correctly; DICOM list shows external-launch button

## Milestone 16 — AQL editor + data tables (§8)

> Power-user surface — researcher + audit-reviewer. Later because daily clinicians don't author AQL.

- [ ] `@uiw/react-codemirror` wrapper with AQL grammar highlighting — AQL Release 1.1.0 spec, types from `@ehrbase-ui/openehr-aql`
- [ ] AQL autocomplete schema for the main RM classes + the v1.0 archetype catalogue (ADR-0016)
- [ ] Stored-query persistence — `docs/aql-catalogue.md` model
- [ ] Result table via shadcn `data-table` + `@tanstack/react-table`
- [ ] Virtualized rows > 500 via `@tanstack/react-virtual`
- [ ] Query export (CSV / JSON) — rate-limited per §5.9
- [ ] Stricter `aql-complex` rate limit applied per §5.9
- [ ] Storybook + E2E: write an AQL query, save it, run it, see virtualised results

## Milestone 17 — Admin: user/role mgmt + audit-review UI (CLINICAL-UI.md §§7.15–7.16)

> Keycloak admin proxy + audit-review dashboard only. Patient demographic admin moved to M7; CDS rule authoring moved to M9.

- [ ] User / role management at `/_authed/admin/users` — proxies Keycloak admin API via BFF
- [ ] Audit-review dashboard at `/_authed/admin/audit` — sample-of-60 review queue, drill-down drawer, mark-reviewed action — §14.13
- [ ] Audit-review meta-audit: reviewer access produces `META_AUDIT_ACCESS` events
- [ ] Anomaly heuristics surface (`/admin/audit/anomalies`) — off-hours, bulk reads, repeat 403s — §14.13
- [ ] Quarterly review export (PDF for binder, signed by reviewer)
- [ ] Storybook stories for the admin surfaces

## Milestone 18 — Messaging + decision-support surfaces (CLINICAL-UI.md §7.21)

> Inbox + lab-alert + reminder surfaces. Last clinical milestone because it depends on every prior surface's data.

- [ ] Inbox at `/_authed/inbox` — `DataTable` of threads + `Sheet` per thread
- [ ] Lab-result alert generation (when a result lands abnormal and CDS rule `cds_006_critical_lab` triggers via M9, drop into inbox)
- [ ] Referral-response inbox messages (when a referral comes back from M15's referral surface)
- [ ] Internal messages — non-openEHR, app-DB tables (workflow, not clinical data)
- [ ] CDS-alert acknowledgement audit trail (handled by M9 generic flow)
- [ ] Reminder surface on patient banner — when CDS rules with severity=info fired at last write, display as a non-blocking banner badge
- [ ] Audit: `READ` on `MESSAGE` (custom resource type), purpose `TREATMENT` when patient-linked
- [ ] Storybook + E2E covering inbox + lab-alert + reminder flows

## Milestone 19 — Hardening + release (§19, §21, §22, §25, §26)

> v1.0 tag.

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
- [ ] M7 patient-merge: confirm whether 2-person approval gate needed (clinical-safety question deferred from M7)
- [ ] Tag `v1.0.0`

---

## Conventions

- Strikethrough (`~~`) items are deferred deliberately (see §1 "Explicitly NOT in v1.0").
- When you tick a box, link the PR that completed it: `- [x] **1A** Repo skeleton ([#42](…))`.
- New items added during build-out land at the end of the relevant milestone with a date, e.g. `- [ ] (added 2026-06-10) …`.
