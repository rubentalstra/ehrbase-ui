# `ehrbase-ui` — Implementation Checklist

> Tracker for the v1.0 build-out. Mark `[x]` when shipped, `[~]` when in-flight, blank when not started.
>
> Sourced from [`docs/architecture.md`](architecture.md) v3.4. When the arch doc changes, this checklist follows. Every line cites the §-section in the arch doc that defines the deliverable.

> **⚠️ Core-refocus (2026-05-30) + audit re-grounding & re-sequence (2026-05-31).** The 2026-05-30
> core-refocus removed the _bespoke_ governance layer. The **2026-05-31 re-plan** (1) re-grounds
> audit on the standard — EHRbase 2.31.0 has **no native ATNA / ABAC** ([ADR-0043](adr/0043-ehrbase-oss-boundary.md)),
> so we build **IHE ATNA access auditing from the BFF** + openEHR `CONTRIBUTION`/`ATTESTATION` write
> lineage as the foundational milestone **M9** ([ADR-0041](adr/0041-audit-access-governance.md));
> (2) expands the role model to **7 personas** ([ADR-0040](adr/0040-expanded-role-model.md)); and
> (3) **re-sequences the clinical build spine-first** ([ADR-0042](adr/0042-clinical-milestone-resequencing.md)
> — see the old→new mapping table at the end). Still **deferred** (hardening only): hash-chain
> tamper-evidence, retention/purge, cold-store WORM, the OTel/Tempo/Loki/Prometheus/Grafana stack,
> ClamAV, and the DPIA/compliance docs. Auth/BFF (M2), the openEHR packages (M5.5), the form engine
> (M6), the demographic server (M7 server half), and the health/ready probes are KEPT and live.

## Milestone 1 — Foundation

Scaffolds every tooling rail the later milestones plug into. No PHI-touching code lands here.

- [x] **1A** Repo skeleton + ADR seeding + `.claude/` setup
- [x] **1B** TanStack Start + Tailwind v4 scaffold — §4, §6
- [x] **1C** shadcn init + first component batch — §6
- [x] **1D** ESLint v10 flat config + `jsx-a11y-x` + `@eslint-react` + `react-hooks` v7 — §12.3
- [x] **1E** Vitest + `vitest-axe` + Button axe baseline test — §12.4, §24
- [x] **1F** Playwright + `@axe-core/playwright` + smoke E2E — §12.4, §24
- [x] **1G** Paraglide JS init + `en.json` + first `m.*` call — §11
- [x] **1H** Storybook 10.4.1 on the official `@storybook/tanstack-react` framework + `addon-a11y` + `addon-vitest` (stories run as browser tests, a11y hard gate, blocking `storybook-test` CI job — ADR-0010, ADR-0047) — §17, §24
- [x] **1I** Pino app logger, stdout only (app logging only; the audit write path was removed in the core-refocus) — §13.1
- [x] **1J** `orval` config + vendored EHRbase OpenAPI stub — §15
- [x] **1K** Dockerfile + docker-compose dev stack (EHRbase + Keycloak + Valkey + Postgres) + realm import — §18, §5.6
- [x] **1L** CI/CD pipelines + CODEOWNERS, PR + issue templates — §20 (semver-tag pinning per ADR-0011)
- [x] **1M** Pre-commit hooks via `husky` + `lint-staged` + `commitlint`
- [x] **1N** `.claude/` — sub-agents, `.mcp.json`, project notes
- [x] **1O** ADR-0001 (stack) + ADR-0010 (storybook upgrade) + ADR-0011 (action pinning) ratified

## Milestone 2 — Auth + BFF (§5)

> Auth + BFF are KEPT and live. The audit **write core** (2A audit DB, 2B `logAudit`/hash-chain) was
> removed in the core-refocus; the **standards-based replacement (IHE ATNA from the BFF) returns as
> M9** ([ADR-0041](adr/0041-audit-access-governance.md)). Break-glass + rate-limit + CSRF +
> security-headers below are KEPT.

- [ ] ~~**2A** Audit DB infra~~ — ❌ removed in the core-refocus; the standards-based audit store
      (Postgres `audit` schema for IHE ATNA events) is **rebuilt in M9** ([ADR-0041](adr/0041-audit-access-governance.md)).
- [ ] ~~**2B** Audit write core (`logAudit`, hash chain, pseudonymize)~~ — ❌ removed; replaced by the
      **IHE ATNA `auditAccess()` emitter in M9** (hash-chain tamper-evidence stays deferred).
- [x] **2C** Valkey session store — read / write / destroy helpers + sliding TTL — §5.3
- [x] **2D** OIDC login (PKCE + state), callback (token exchange + session set), `/api/auth/logout` — §5.4
- [x] **2E** `requireAuth` + silent refresh + idle 15 min / absolute 12 h timeouts — §5.5, §5.10
- [x] **2F** `requireRole(...)` + break-glass hint on PHI denials — §5.6 _(expands to the 7-persona set in M8 — ADR-0040)_
- [x] **2G** Security-headers middleware (per-request CSP nonce + `strict-dynamic` + HSTS + COOP/COEP) — §5.7
- [x] **2H** CSRF defense (Origin check + single-use per-form token) — §5.8
- [x] **2I** Rate limiting via `rate-limiter-flexible` against Valkey — §5.9
- [x] **2J** BFF EHRbase proxy — authed pass-through, request classification, §5.9 limit, 404/403 conflation — §5, §10
- [x] **2K** Break-glass emergency-access flow — 60-min grant, 3/lifetime ceiling — §5.6
- [x] **2L** Minimal authed UI (`/_authed` + `/me`) + sign-in control — §5
- [x] **2M** Source maps hidden in production — §5.11
- [x] **2N** Tests + ADR ratification + secrets/env/compose/gitleaks wiring

## Milestone 0 — Monorepo migration (Turborepo + pnpm-workspaces, ADR-0030)

> **DONE.** The repo is a Turborepo + pnpm-workspaces monorepo: `apps/web/` + `packages/openehr-*` +
> `packages/{demographic-core,term-*,ui,i18n,valkey,config-*}`. Per [ADR-0035](adr/0035-app-server-code-in-apps-web.md)
> the former `audit`/`auth`/`http-bff`/`observability`/`db-platform` packages were **collapsed into
> `apps/web/src/server/*`** (not separate packages); the `demographic-adapter-fhir` package was
> removed in the core-refocus (the `DemographicProvider` interface is retained).

- [x] pnpm-workspace.yaml + turbo.json + root package.json + root tsconfig — ADR-0030
- [x] Config packages: `@ehrbase-ui/config-{tsconfig,eslint,tailwind}`
- [x] App at `apps/web/src/`; `public/`, `e2e/`, `messages/`, vitest + playwright configs follow
- [x] App-server platform under `apps/web/src/server/{db,auth,bff,observability,crypto,functions}/` (ADR-0035)
- [x] openEHR per-spec packages: `openehr-{base,rm,am,aql,proc,cds,term,its-rest,flat,web-template}` — ADR-0032
- [x] Demographic provider: `packages/demographic-core` (built-in Postgres adapter) — ADR-0031
- [x] Terminology provider: `term-core` + `term-adapter-snowstorm` + `term-adapter-generic-fhir` — ADR-0034
- [x] UI package: `packages/ui` (shared shadcn primitives where shared) + `packages/{i18n,valkey}`
- [x] All imports use `@ehrbase-ui/*`; workspace deps via `workspace:*`
- [x] ADRs 0030–0035 ratified; Inviolable rule 13 added to CLAUDE.md
- [x] `pnpm turbo run build typecheck lint test` green from root

## Milestone 3 — UI shell + i18n + state (§6, §9, §10, §11, §12)

- [x] App shell — sidebar (cookie state) + nav + theme toggle + `Command` palette
- [x] `ThemeProvider` with `localStorage` + no-flash inline script (next-themes — ADR-0014)
- [x] Error boundaries per feature area
- [x] TanStack Query global error → toast + correlation ID
- [x] Public `/accessibility` statement page — §12.8
- [ ] `/_authed/me/access-log` (Art. 15 patient access log) — **fed by the M9 IHE ATNA trail; built in M22** (ADR-0041)
- [x] Skip-to-content link, visible focus rings, `scroll-margin-top` for sticky headers — §12.6
- [~] Manual NVDA + VoiceOver test report under `docs/accessibility/` — §12.7 (report written 2026-05-27; NVDA/VoiceOver passes PENDING human run before the **M24** release)

## Milestone 4 — Audit governance + retention — ❌ REMOVED (core-refocus); superseded by M9 + deferred hardening

The bespoke NEN-7513 hash-chain subsystem this milestone owned is **superseded by the standards-based
M9** (IHE ATNA from the BFF — [ADR-0041](adr/0041-audit-access-governance.md)). The _hardening_ parts
(retention/purge, cold-store WORM, nightly integrity job, DPIA/DPA/RoPA, breach runbooks) remain
**deferred** (see CLAUDE.md → "Deferred (post-core)" + [`docs/v1.x-roadmap.md`](v1.x-roadmap.md)).

## Milestone 5 — Observability — ❌ REMOVED (core-refocus; kept only /api/health + /api/ready + plain Pino)

- [x] `/api/health` + `/api/ready` — §13.4 (probes Valkey + EHRbase + Keycloak + auth DB)
- [x] Plain-stdout Pino app logging — §13.1
- [ ] ~~OTel SDK + Tempo/Loki/Prometheus/Grafana + PHI-redaction~~ — ❌ deferred post-core

## Milestone 5.5 — openEHR Spec Foundation (`packages/openehr-*`) — ✅ COMPLETE

> All 10 `openehr-*` packages built (24 turbo typecheck+test tasks green); single ITS-JSON→Zod
> generation pipeline; RM round-trips 10 real canonical compositions. Pinned to **EHRbase 2.31.0
> reality** (RM 1.1.0 + BASE 1.1.0 + ADL 1.4) per the ADR-0032 addendum.

- [x] Shared regen pipeline + custom ITS-JSON→Zod generator (`scripts/openehr-zodgen.mjs`)
- [x] `openehr-base` (BASE 1.1.0) facade + future-version primitives
- [x] `openehr-rm` (RM 1.1.0) — 102 classes; canonical-COMPOSITION round-trips
- [x] `openehr-its-rest` (orval Zod schemas), `openehr-web-template` (`generateFormSchema`), `openehr-flat` (FLAT grammar + converters), `openehr-am` (ADL 1.4 ids)
- [x] `openehr-aql` (typed AST + builders), `openehr-term`, `openehr-proc` (Task Planning), `openehr-cds` (GDL2-aligned `CdsRule`)
- [x] CI per-package `regen:check` drift gate; ESLint bans third-party openEHR SDKs
- [x] Empirical confirmation off the live EHRbase 2.31.0 dev stack (RM 1.1.0 / ADL 1.4)
- [~] ADR-0016 catalogue round-trip harness — 10 fixtures green; broaden toward every v1.0 archetype as a release-gate follow-up

## Milestone 6 — openEHR form engine (§7) — ✅ COMPLETE (server + UI)

> The form-rendering substrate every clinical write surface depends on. Server-integration landed
> 2026-05-30; the UI half (`apps/web/src/components/openehr/*`) is built and exercised in the
> workbench (`/_authed/workbench/compose` + `/compositions`).

- [x] Web-template fetch + cache — `template.{functions,server}.ts`, Valkey 1h TTL, `Accept: application/json`
- [x] Zod schema generator from web template — `generateFormSchema`; re-validated server-side before every FLAT write
- [x] `FieldRenderer` (rmType → shadcn map) — `apps/web/src/components/openehr/field-renderer.tsx`
- [x] `ArrayFieldRenderer` (`useFieldArray` cardinality) — `apps/web/src/components/openehr/array-field-renderer.tsx`
- [~] FLAT (write) + STRUCTURED (read) + CANONICAL (export) converters — `packages/openehr-flat`; FLAT write+read **wired** server-side; STRUCTURED/CANONICAL pending
- [x] `DV_MULTIMEDIA` upload — `upload.{functions,server}.ts`; magic-byte sniff + JPEG EXIF strip + 50MB cap (ClamAV sidecar removed in core-refocus — deferred)
- [x] Optimistic concurrency (If-Match ETag) + side-by-side diff modal — `conflict-dialog.tsx`; BFF maps 412 → typed CONFLICT with current etag
- [x] Autosave drafts → encrypted Valkey, 24-hour TTL — `drafts.{functions,server}.ts` + `@noble/ciphers` authenticated encryption (`field-encryption.server.ts`, ADR-0037)
- [x] `CompositionViewer` — `apps/web/src/components/openehr/composition-viewer.tsx` (reads via FLAT, read-only `FieldRenderer`; STRUCTURED read-back optional)
- [x] CONTRIBUTION committer population — EHRbase 2.31 derives the committer from the forwarded token (NOT `openEHR-COMMITTER-*` headers, which it ignores — ADR-0041)
- [~] Terminology autocomplete — coded-field expansion via server fn present in `field-renderer.tsx`; full Snowstorm autocomplete on clinical coded fields lands with M10+ (`@ehrbase-ui/term-core`, ADR-0034)

## Milestone 7 — Demographic admin + EHR linkage (pluggable provider; ADR-0031)

> **Server foundation (2026-05-30) + admin UI + audit foundation + EHR linkage (2026-05-31) shipped.**
> The provider / REST / registry / pseudonymisation / contract-suite, the admin patients UI, the
> patient server functions, EHR auto-provisioning, the IHE-ATNA **audit foundation** (built here per
> [ADR-0041](adr/0041-audit-access-governance.md); M9 extends it), and the dev demo-data seed all
> land in M7. **Remaining = tests / Storybook + the merge-approval clinical-safety question.**

- [x] `DemographicProvider` interface in `packages/demographic-core` — ADR-0031
- [x] Built-in Postgres adapter (`demographic` schema + roles) — schema in `demographic-core/builtin`; client/migrations in `apps/web/src/server/db` (ADR-0035)
- [x] PARTY hierarchy (PERSON, PARTY_IDENTITY, CONTACT, ADDRESS, ROLE, PARTY_RELATIONSHIP) — canonical FHIR-shaped `Party` projection
- [x] VERSIONED_PARTY semantics (current + history; `listVersions`)
- [x] REST surface `/api/demographic/*` — role-gated
- [x] Identifier-namespace registry: NL (BSN), BE (NISS), FR (NIR), DE (KVNR), IT (CF), ES (TIS), PT (NUTS), AT (bPK), PL (PESEL), MRN
- [x] Pseudonymisation: HMAC-SHA256 with the shared secret
- [x] Dual-adapter contract suite (`@ehrbase-ui/demographic-core/contract`)
- [x] Patient **server functions** (`patient.{functions,server}.ts`) — search/get/versions/capabilities (clinician+admin reads); create/update/deactivate/merge/identifiers/relationships + EHR link (admin writes); errors → stable codes only (rule 2)
- [x] **Demographic admin UI** at `/_authed/admin/patients/*` — list/search, create (PatientForm + IdentifierField with live checksum validation), detail (demographics, identifiers add/end, version-history, deactivate, capability-gated merge, linked-EHR view/provision), readonly-capability banner. _(Relationships read deferred — needs a provider `listRelationships`; the add/end server fns exist.)_
- [x] EHRbase `EHR_STATUS.subject` wired as `PARTY_SELF` + `external_ref` through the provider — auto-provisioned at patient-create (+ `provisionEhr` retry; no orphans)
- [x] **Audit foundation** (rule 1, [ADR-0041](adr/0041-audit-access-governance.md)) — append-only Postgres `audit` schema + IHE-ATNA AuditMessage builder + `auditAccess` + `PostgresAuditSink` wired into the provider. _(M9 extends to the EHRbase composition/query path + care-relationship gate + syslog + review side.)_
- [x] **Dev demo-data seed** behind `SEED_DEMO_DATA` (rule 14, `docs/DEV-DEMO-DATA.md`)
- [ ] Tests + Storybook: server-fn unit (mocked provider + `callEhrbase` + audit-row), ATNA-builder unit, `PatientForm` axe, gated E2E golden-path
- [ ] M7 patient-merge: confirm whether a 2-person approval gate is needed (clinical-safety question — revisit at M24)

## Milestone 8 — 7-persona RBAC + workspace shell + patient context (CLINICAL-UI.md §§7.1–7.4, ADR-0040)

> The patient-bound layout + cross-cutting surfaces that lead to every clinical screen. Reads the M7
> `DemographicProvider`. Establishes the role model + patient context; **rich role dashboards move to
> M19** (after the data they aggregate exists — ADR-0042).
>
> **Human-centric identity rewrite shipped (ADR-0046 / rule 15):** no machine identifier is a
> user-facing handle. Auto-MRN at create; global patient search by name/DOB/MRN (⌘K + `/patients`);
> the `/patients/$patientId` patient-context shell + persistent banner; the `PatientPicker` retrofit
> removed every UUID input (break-glass, workbench, merge). The 7-persona role model + role
> picker/landing + recently-viewed + encounters remain open below.

- [ ] 7 Keycloak realm roles (physician / nurse / lab-technician / pharmacist / admin / audit-reviewer / researcher) + `ehrbase-users.dev.json` demo users — ADR-0040, ADR-0036
- [ ] Extend `ROLES` const (`apps/web/src/server/auth/require-role.ts` + `apps/web/src/lib/auth/auth.functions.ts`) to the 7-set; `clinician` umbrella inheritance for the four clinical sub-roles
- [ ] First-login role picker at `/_authed/role-picker` for multi-role users — ADR-0040/0017
- [x] Patient header banner — layout wrapping `/_authed/patients/$patientId/*`; reads M7 provider + resolved EHR (ADR-0046; `patient-banner.tsx`). Summary AQL (allergies/problems) fills in later milestones
- [ ] Care-team / care-relationship model + banner indicator (display) — consumed by the M9 access gate
- [x] Global patient search (name/DOB/MRN) — ⌘K command palette + `/_authed/patients` page (ADR-0046; M7 provider + EHRbase existence check via getLinkedEhr)
- [ ] Recently-viewed list at `/_authed/patients/recent` — per-user app-DB table
- [ ] Encounter / visit list at `/_authed/patients/$patientId/encounters` — AQL over `DIRECTORY/FOLDER` (empty until M12 notes create encounters)
- [ ] Basic role landing (`/_authed/home` → my-patients list per role) — NOT the rich dashboards (M19)
- [x] Keep `/_authed/workbench/*` as an admin/developer tool — UUID inputs replaced by patient search (ADR-0046); AQL stays a power tool
- [ ] Storybook stories for the banner + role landing; E2E: deep link to a patient survives login; role picker works

## Milestone 9 — Access governance: extend IHE ATNA + fine-grained access control (ADR-0041)

> **The audit EMITTER foundation shipped in M7** — the IHE-ATNA AuditMessage builder, `auditAccess`,
> the append-only Postgres `audit` schema, and the `PostgresAuditSink` on the demographic provider.
> M9 **extends** it across the EHRbase write/read path, adds the fine-grained access gate, and feeds
> the read-side consumers (M22). EHRbase 2.x has no native ATNA/ABAC (ADR-0043), so this is ours.

- [x] BFF `auditAccess(...)` helper + IHE-ATNA DICOM AuditMessage builder — **M7** (`apps/web/src/server/audit/`)
- [x] Append-only Postgres `audit` schema + migration (queryable; consumed by M22) — **M7**
- [x] `PostgresAuditSink` wired into the demographic provider; EHR-provision + linked-EHR lookups audited — **M7**
- [ ] Wire `auditAccess()` into the `callEhrbase` choke point so every composition / query / template / directory access is audited (retrofit the engine server fns + the BFF proxy)
- [ ] Fine-grained access control — care-relationship/care-team check enforced in the BFF before proxying; deny → 403 + `break-glass: available` (wired to the M2 break-glass flow)
- [ ] `ATTESTATION` helper for signed content (used by M12 notes, M15 CDS-override, M16 orders)
- [ ] Optional RFC-5424 syslog/TLS forwarder to an external Audit Record Repository
- [ ] ADR follow-up: pin the syslog transport library (the TS AuditMessage builder shipped in M7)
- [ ] Storybook/E2E: a read + a write each land a correct audit row; an out-of-care-relationship access is denied + audited; break-glass grants + is audited

## Milestone 10 — Problems + allergies + immunisations (CLINICAL-UI.md §§7.8, 7.10, 7.11)

> The patient-summary backbone. Lights up the banner's problem/allergy counts. SNOMED via term-core.

- [ ] Combined route `/_authed/patients/$patientId/problems` with tabs (problems / allergies / immunisations)
- [ ] Problem list — `EVALUATION.problem_diagnosis.v1`, SNOMED CT-coded — `DataTable`, `Sheet` for add/edit
- [ ] Allergies — `EVALUATION.adverse_reaction_risk.v1`, severity Badge, SNOMED CT-coded (nurse may add newly-detected reactions)
- [ ] Immunisations — `ACTION.immunisation.v1`, timeline view, SNOMED CT vaccine codes
- [ ] AQL: `problems_active`, `problems_history`, `allergies_active`, `immunisations_history`; banner-summary feed updated
- [ ] Audit + access-control via M9; dual-layer (CONTRIBUTION + ATNA)
- [ ] Storybook + E2E covering each tab

## Milestone 11 — Medications (CLINICAL-UI.md §7.9)

- [ ] Medications route `/_authed/patients/$patientId/medications`
- [ ] Active med list — `INSTRUCTION.medication_order.v3` + `ACTION.medication.v1`, ATC-coded — custom `MedicationCard`, `PrescribeDrawer` (physician), `AdministerDrawer` (nurse)
- [ ] Pharmacist verify/dispense surface (ADR-0040 persona)
- [ ] AQL: `medications_active`, `medication_administrations_recent`; banner-summary feed
- [ ] Audit + access-control via M9
- [ ] Storybook + E2E: prescribe → administer → history renders

## Milestone 12 — Clinical notes (CLINICAL-UI.md §7.7)

- [ ] `NoteEditor` — TipTap-based rich text + structured-field slots (in `packages/ui`)
- [ ] SOAP layout via openEHR `SECTION`; note-type variants (admission / progress / discharge-prep / nurse), role-gated
- [ ] Save as `COMPOSITION.encounter.v1` (+ `EVALUATION.clinical_synopsis.v1`); **sign = `ATTESTATION`** (M9 helper)
- [ ] Autosave every 30 s + on blur; restore on reload; optimistic concurrency on signed-note edits (M6)
- [ ] Creates encounters → lights up the M8 encounter list; AQL `notes_recent_compositions`
- [ ] Audit + access-control via M9
- [ ] Storybook + E2E: type a note, sign it, reload, appears in encounter list

## Milestone 13 — Vitals flowsheet (CLINICAL-UI.md §7.5)

- [ ] Vitals flowsheet at `/_authed/patients/$patientId/vitals` — custom `VitalsFlowsheet` grid + Recharts `LineChart` per archetype (ADR-0018)
- [ ] Nurse-led quick-entry drawer — writes `OBSERVATION` per archetype (blood_pressure.v2, pulse.v2, body_temperature.v2, respiration.v2, pulse_oximetry.v1, body_weight.v2, height.v2, body_mass_index.v2) — ADR-0016
- [ ] AQL: `vitals_latest_*` + `vitals_trend_*` per archetype — added to `docs/aql-catalogue.md`
- [ ] Audit + access-control via M9 (CDS critical-BP wiring lands in M15)
- [ ] Storybook + E2E: record vitals → flowsheet + trend update

## Milestone 14 — Labs timeline (CLINICAL-UI.md §7.6)

- [ ] Lab results timeline at `/_authed/patients/$patientId/labs` — `DataTable` + Recharts trend
- [ ] `lab-technician` entry/validation surface (ADR-0040 persona); `OBSERVATION.laboratory_test_result.v1` / `urinalysis.v1`
- [ ] Abnormal-flag highlighting via reference-range comparison (per LOINC); LOINC autocomplete via `@ehrbase-ui/term-core`
- [ ] AQL: `labs_recent_results`, `labs_results_by_loinc`
- [ ] Audit + access-control via M9 (CDS critical-lab + renal-dose wiring lands in M15)
- [ ] Storybook + E2E: lab abnormal flag renders; lab-tech validates a result

## Milestone 15 — CDS infrastructure + rule authoring + runtime + 10-rule pack (CLINICAL-UI.md §7.17, ADR-0021)

> **After its data** (M10/M11/M13/M14) so rules are testable end-to-end. Built once; wires every rule
> into the surfaces that already exist. Dismiss-with-justification reused by M16.

- [ ] `@ehrbase-ui/openehr-cds` `CdsRule` schema (GDL2-aligned, ADR-0021) — already built in M5.5; wire it
- [ ] CDS rule storage in a Postgres schema + Drizzle migrations
- [ ] CDS rule authoring at `/_authed/admin/cds-rules` — form-based (NOT raw GDL2); archetype-path binding pickers via the M6 form engine
- [ ] Activation toggle + dry-run preview
- [ ] Runtime evaluator in the BFF — loads active rules, evaluates on every composition write
- [ ] Severity handling: info (banner), warning (modal), critical (block until dismissed-with-justification)
- [ ] Generic dismiss-with-justification → `EVALUATION.cds_override.v0` + `ATTESTATION` + ATNA `CDS_OVERRIDE` access event
- [ ] 10-rule pack `cds_001`–`cds_010` (drug-allergy, drug-drug, renal-dose, paediatric-weight, critical-BP, critical-lab, duplicate-order, anticoagulant-INR, pregnancy-contra, allergy-severity-unknown)
- [ ] **Retroactively wire** rules into M10 (allergy/problem), M11 (meds), M13 (vitals), M14 (labs); feed the banner critical-flag
- [ ] Storybook + E2E: author → dry-run → activate → trigger on write → dismiss with justification → audit lands

## Milestone 16 — Orders / CPOE (CLINICAL-UI.md §7.12)

- [ ] Orders route `/_authed/patients/$patientId/orders`
- [ ] Order types: medication (`INSTRUCTION.medication_order.v3`), lab (`laboratory_test_order.v1`), imaging (`imaging_examination_request.v1`) — ADR-0019
- [ ] Fulfilment records `ACTION.medication.v1` / `ACTION.procedure.v1`; order sets via `@ehrbase-ui/openehr-proc` `TASK_PLAN.order_set_id` — ADR-0025
- [ ] `OrderSetPicker` + `DataTable`; workflow-id linking (INSTRUCTION ↔ ACTION); order signing via `ATTESTATION`
- [ ] CDS at order entry (M15 runtime); critical alerts blocked until dismiss-with-justification
- [ ] FHIR `MedicationRequest` / `ServiceRequest` export transformer (one-way) — ADR-0019, ADR-0033
- [ ] AQL: `orders_pending`, `orders_recent_completed`
- [ ] Storybook + E2E: prescribe a med that triggers an allergy alert → dismiss → audit correct

## Milestone 17 — Care plan + tasks (CLINICAL-UI.md §7.13)

- [ ] Care plan route `/_authed/patients/$patientId/care-plan`
- [ ] Tree of `WORK_PLAN` → `TASK_PLAN` → `PLAN_ITEM` — `@ehrbase-ui/openehr-proc`, ADR-0025
- [ ] Task completion writes `ACTION.care_plan.vN` with `workflow_id`; goal/outcome tracking (subset)
- [ ] AQL: `care_plan_active_tasks`, `care_plan_tasks_overdue` (overdue feeds the nurse dashboard, M19)
- [ ] Storybook + E2E: nurse closes a task → tree updates → ACTION lands in EHRbase

## Milestone 18 — Discharge + referrals + document viewer + print/PDF (CLINICAL-UI.md §§7.18–7.20, ADR-0020)

- [ ] Discharge summary editor — assembles from problems/meds/results into `COMPOSITION.discharge_summary.v1`
- [ ] Referral letter editor — `COMPOSITION.referral.v0`
- [ ] Document viewer — PDF.js + image viewer; DICOM study listing + external-PACS-viewer launch (no embedded DICOM in v1.0) — ADR-0020
- [ ] Print/PDF via Tailwind `print:` + page-break utilities; print-only header (patient / DOB / MRN / doc title / date)
- [ ] Storybook + E2E: print preview renders; DICOM list shows external-launch

## Milestone 19 — Rich role dashboards (CLINICAL-UI.md §5)

> **Late** — the homes aggregate data from M10–M18, so they're built once, after that data exists.

- [ ] `/_authed/home` resolves to the role's rich dashboard (ADR-0040): physician, nurse, lab-technician, pharmacist, admin, audit-reviewer, researcher
- [ ] Shared widget components (patient-list, task badges, alert badges, pending sign-offs) reused across homes
- [ ] Storybook stories for each home variant; E2E: each role's home renders real aggregates

## Milestone 20 — AQL editor + query catalogue (§8)

> Power-user surface — researcher + audit-reviewer.

- [ ] `@uiw/react-codemirror` + AQL grammar highlighting — types from `@ehrbase-ui/openehr-aql`
- [ ] Autocomplete for the main RM classes + the v1.0 archetype catalogue (ADR-0016)
- [ ] Stored-query persistence; finalize `docs/aql-catalogue.md`
- [x] Shared `DataTable` primitive (sort / filter / pagination / virtualize) — `apps/web/src/components/ui/data-table.tsx` (ADR-0038; landed early)
- [x] Result table via the `DataTable` primitive; virtualized rows > 500 via `@tanstack/react-virtual`
- [ ] Query export (CSV / JSON), rate-limited; stricter `aql-complex` rate limit — §5.9
- [ ] Storybook + E2E: write → save → run → virtualised results

## Milestone 21 — Admin: user / role management (CLINICAL-UI.md §7.15)

- [ ] User / role management at `/_authed/admin/users` — proxies the Keycloak admin API via the BFF
- [ ] Storybook stories for the admin surfaces

## Milestone 22 — Audit-review dashboard + Article-15 access log (CLINICAL-UI.md §§7.16, 7.22 — fed by M9)

> Read-side consumers of the M9 IHE ATNA trail.

- [ ] Audit-review dashboard at `/_authed/admin/audit` — sample-of-N review queue, drill-down drawer, mark-reviewed; reviewer access is itself audited (meta-audit)
- [ ] Anomaly heuristics (`/admin/audit/anomalies`) — off-hours, bulk reads, repeat 403s
- [ ] Article-15 patient access log at `/_authed/me/access-log` — patient sees who accessed their record; PDF download
- [ ] Quarterly review export (PDF, signed by reviewer)
- [ ] Storybook + E2E for both surfaces

## Milestone 23 — Messaging / inbox (CLINICAL-UI.md §7.21)

- [ ] Inbox at `/_authed/inbox` — `DataTable` of threads + `Sheet` per thread (non-openEHR app-DB tables)
- [ ] Lab-result alert generation via **AQL polling** (EHRbase 2.x has no native event trigger — ADR-0043) when a result lands abnormal / CDS `cds_006` triggers
- [ ] Referral-response messages (from M18); reminder badges on the banner (info-severity CDS)
- [ ] Audit via M9 (`READ` on `MESSAGE`)
- [ ] Storybook + E2E covering inbox + lab-alert + reminder flows

## Milestone 24 — Hardening + release (§19, §21, §22, §25, §26)

> v1.0 tag.

- [ ] Add `nl` + EU locales (one pass; additive in Paraglide) — §11
- [ ] Secrets via env / Doppler — §19
- [ ] Backup + DR drill runbook — §21
- [ ] Performance budgets in CI (Lighthouse) — §22
- [ ] Browser-support soft-block page — §23
- [ ] Manual NVDA + VoiceOver pass over every clinical surface — §12.7
- [ ] `/accessibility` conformance statement signed — §12.8
- [ ] DPIA legal sign-off — §14.10
- [ ] Penetration test
- [ ] Clinical reviewer sign-off on `docs/CLINICAL-UI.md`
- [ ] Tag `v1.0.0`

---

## Milestone re-sequence — old → new mapping (ADR-0042)

The 2026-05-31 re-plan re-sequenced the clinical build spine-first. Reused numbers carry **new**
content; this table is authoritative.

| Old                                                  | Old scope                                   | New                                                                                                |
| ---------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| M8                                                   | Patient core + workspace shell + role homes | **M8** (shell + context + roles) + **M19** (rich dashboards, split out, moved late)                |
| M9                                                   | CDS infrastructure                          | **M15** (moved after its data)                                                                     |
| M10                                                  | Vitals + labs                               | **M13** (vitals) + **M14** (labs)                                                                  |
| M11                                                  | Clinical notes                              | **M12**                                                                                            |
| M12                                                  | Problems + meds + allergies + immunisations | **M10** (problems/allergies/immun) + **M11** (medications)                                         |
| M13                                                  | Orders / CPOE                               | **M16**                                                                                            |
| M14                                                  | Care plan + tasks                           | **M17**                                                                                            |
| M15                                                  | Discharge + referrals + documents + print   | **M18**                                                                                            |
| M16                                                  | AQL editor + data tables                    | **M20**                                                                                            |
| M17                                                  | Admin: user/role mgmt + audit-review        | **M21** (user/role) + **M22** (audit-review)                                                       |
| M18                                                  | Messaging + decision-support                | **M23**                                                                                            |
| M19                                                  | Hardening + release                         | **M24**                                                                                            |
| M4 (removed) + M2-2A/2B (removed) + M3/M4 Article-15 | bespoke NEN-7513 audit subsystem            | **M9** (access governance, IHE ATNA from BFF) + **M22** (Article-15 read-side); hardening deferred |
| —                                                    | NEW                                         | **M9** access governance (ADR-0041)                                                                |

## Conventions

- Strikethrough (`~~`) items are deferred deliberately (see §1 "Explicitly NOT in v1.0" + `docs/v1.x-roadmap.md`).
- When you tick a box, link the PR that completed it: `- [x] **1A** Repo skeleton ([#42](…))`.
- New items added during build-out land at the end of the relevant milestone with a date, e.g. `- [ ] (added 2026-06-10) …`.
