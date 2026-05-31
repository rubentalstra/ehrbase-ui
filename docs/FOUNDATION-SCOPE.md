# openEHR + EHRbase Foundation — Coverage & Scope Ledger

> **Purpose.** This is the single source of truth for _what the foundation implements vs what is
> deliberately out of scope_, so nothing is silently missed when we build clinical surfaces on
> top of it. It is the output of the 2026-05-31 spec-by-spec completeness audit (RM / BASE / AM /
> AQL / ITS-REST / TERM / web-template / FLAT + the server integration) and the F1–F5 work that
> closed the gaps it found. Every "out of scope" line below is a _decision with a rationale_, not
> an omission.
>
> Pins (ADR-0032, pin-to-EHRbase-2.31.0): **RM 1.1.0 · BASE 1.1.0 · AM = ADL 1.4 / OPT 1.4 ·
> AQL 1.1.0 · ITS-REST 1.0.3 · TERM 3.0.0**. Update this doc whenever a package's coverage or a
> scope boundary changes.

## 1. Coverage by spec area

| Area                                         | Package(s)                                                           | Coverage                                                                                                                                                                                                                                                                                                                       | Verdict                                                                                                                                                      |
| -------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **RM 1.1.0**                                 | `openehr-rm`                                                         | **100%** of concrete classes (102/102) generated from the pinned ITS-JSON + 9 hand-stitched abstract unions (DATA_VALUE, ITEM, ITEM_STRUCTURE, ENTRY, CARE_ENTRY, CONTENT_ITEM, EVENT, PARTY_PROXY)                                                                                                                            | Foundation-complete. 10 canonical fixtures round-trip; `all_types_no_multimedia` now passes via the F3 lenient DV_INTERVAL parse.                            |
| **BASE 1.1.0**                               | `openehr-base`                                                       | **100%** (32/32 schema classes: identification, foundation types, terminology, resource)                                                                                                                                                                                                                                       | Foundation-complete. The only un-modelled items are spec _constants_ + abstract `AUTHORED_RESOURCE` (not in the ITS-JSON schema set; not wire-serialised).   |
| **AM (ADL 1.4 / AOM 1.4 / OPT 1.4)**         | `openehr-am`                                                         | Archetype-id + at/ac node codes **100%**; constraint object model / ADL parsing **not implemented (by design)**                                                                                                                                                                                                                | Foundation-complete _for an EHRbase form-consumer_. EHRbase serves flattened **web templates**, not constraint trees — see §2.                               |
| **AQL 1.1.0**                                | `openehr-aql`                                                        | AST + builders + serializer + **parser (F5)** + VERSION/function expressions + `validateAql` (RM-class/identifier/param level)                                                                                                                                                                                                 | Complete + symmetric. All 20 `docs/aql-catalogue.md` queries round-trip both directions. Deep path-vs-archetype validation needs the OPT (out of scope, §2). |
| **web template + FLAT/STRUCTURED/CANONICAL** | `openehr-web-template`, `openehr-flat`                               | All clinically-used DV\_\* types mapped (**F1**); FLAT write + read; **STRUCTURED read** (`structuredToFormState`); **CANONICAL export** (read, F4); null-flavour + reference-range round-trip (**F3**); fail-fast on unmapped rmTypes                                                                                         | Foundation-complete for clinical capture+read. `formStateToStructured` (STRUCTURED _write_) and `canonicalToFormState` are out of scope (§2).                |
| **ITS-REST 1.0.3 / EHRbase 2.31**            | `openehr-its-rest` + `apps/web/src/server`                           | Zod schemas for ehr/query/definition generated; server fns wired for EHR lifecycle, EHR_STATUS, COMPOSITION CRUD (FLAT) + STRUCTURED read + canonical export, template fetch/list/upload, ad-hoc + stored AQL, DIRECTORY/FOLDER, versioned-composition + revision-history, CONTRIBUTION read, **412 conflict diff/merge (F4)** | Foundation-complete for the clinical workbench. ADMIN API + CONTRIBUTION _write_ (audit) are out of scope (§2).                                              |
| **TERM 3.0.0 (internal)**                    | `openehr-term`                                                       | **100%** of openEHR support-terminology code groups (code→rubric); reverse rubric→code is the one minor gap                                                                                                                                                                                                                    | Complete (the external terminology server covers reverse lookup).                                                                                            |
| **External terminology**                     | `term-core` + `term-adapter-snowstorm` + `term-adapter-generic-fhir` | `TerminologyProvider` (FHIR R4 `$expand`/`$lookup`/`$validate-code`) + Snowstorm (SNOMED) + generic-FHIR (LOINC/national) + FieldRenderer combobox wiring (**F2**)                                                                                                                                                             | Complete. Default `none`; Snowstorm + generic-FHIR opt-in.                                                                                                   |
| **Demographic (EHR/demographic separation)** | `demographic-core` (built-in Postgres)                               | Provider interface + built-in VERSIONED_PARTY store + identifier registry + rule-12 PartyRef↔`EHR_STATUS.subject`                                                                                                                                                                                                              | Foundation-complete (built-in is the default). The FHIR adapter was **removed** (§2; interface retained for re-add).                                         |
| **PROC 1.7.0 / CDS 2.0.1**                   | `openehr-proc`, `openehr-cds`                                        | Authoring schemas only (WORK_PLAN/TASK_PLAN; CdsRule)                                                                                                                                                                                                                                                                          | Sufficient as _models_; the runtime evaluators are **clinical features** (M9 CDS / M13 care-plan), not foundation — see §2.                                  |

## 2. Deliberately out of scope (decided, not missed)

Each of these is excluded _on purpose_. Re-add via the noted path when a real consumer appears.

- **Demographic RM inline in compositions** — compositions never embed name/DOB/national-id;
  the subject is always an external `PARTY_PROXY` reference (CLAUDE.md rule 12 / ADR-0031). The
  demographic RM classes _are_ generated in `openehr-rm` but are not used inline.
- **Demographic FHIR adapter** — removed (2026-05-31). The built-in Postgres provider is the
  standalone default; FHIR is not needed for demographics. The `demographic-core` interface is
  retained so a FHIR / HL7v2-ADT / IHE-PDQ adapter can be re-added behind a new ADR when a
  deployment must read an external patient index. (ADR-0033 marked accordingly.)
- **Extract IM + Integration `GENERIC_ENTRY`** — generated for round-trip fidelity, not consumed
  by the EHR-side UI. (Data-export / feeder-system integration is post-v1.0.)
- **Full ADL/AOM/cADL constraint parser + archetype compiler** — EHRbase serves compiled
  **web templates** (simplified JSON); the UI is a form _consumer_, not an archetype authoring
  tool. `openehr-am` intentionally stops at identifiers + node codes.
- **Security / `ACCESS_CONTROL`** — not RM types; a deployment/governance-layer concern. The
  whole governance/audit layer is deferred post-core (CLAUDE.md → "Deferred (post-core)").
- **PROC + CDS runtime evaluators** — the BFF evaluators are M9 (CDS) / M13 (care-plan) clinical
  features. The authoring schemas exist; the runtime is not "foundation".
- **`formStateToStructured` (STRUCTURED write)** — FLAT is the verified write path; STRUCTURED
  write needs `_type`/encoding/language RM context the form engine doesn't collect. Read-side
  `structuredToFormState` exists.
- **`canonicalToFormState`** — CANONICAL is a read/export format (download/interop), not a form
  input. Export exists (F4); reverse conversion is not needed by the form pipeline.
- **HL7v2 ADT / IHE PDQ demographic adapters, ROLE/ORGANISATION actor types** — v1.x, additive
  over the retained interface.
- **AQL editor UI (CodeMirror grammar, autocomplete)** — M16. The `openehr-aql` library
  (parser + validate) is ready; the editor surface is a separate milestone.

## 3. Pluggable component matrix (what a deployment chooses)

The point of the architecture: a hospital composes its stack. **Fixed core** (always required):
**EHRbase** (openEHR CDR) · **Keycloak** (OIDC auth) · **Postgres** (Keycloak + `auth` +
`demographic` DBs) · **Valkey** (sessions + drafts + rate-limit + cache).

| Concern      | Env switch             | Options                               | Default   | Dev backend (docker profile)                                                                              |
| ------------ | ---------------------- | ------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------- |
| Demographics | `DEMOGRAPHIC_PROVIDER` | `builtin` (Postgres)                  | `builtin` | — (built-in; FHIR adapter removed)                                                                        |
| Terminology  | `TERMINOLOGY_PROVIDER` | `none` · `snowstorm` · `generic-fhir` | `none`    | `--profile snomed` (Snowstorm+ES :8095) · `--profile terminology` (HAPI tx :8094) · public SNOMED sandbox |

`docker compose up` (no profile) brings up only the fixed core. Optional servers are opt-in via
`--profile`. Everything talks standard wire protocols, so a site can point at its own managed
EHRbase / Keycloak / Postgres / Snowstorm instead of the bundled dev containers.

## 4. Live-EHRbase confirmation TODOs

These FLAT/REST contract details are coded against the spec + fixtures but flagged in-code for
verification against a running EHRbase 2.31 (grep `live-EHRbase` / `re-verify`):

- DV_ORDINAL `|code` and DV_MULTIMEDIA `|name`/`|size`/`|mediatype` FLAT suffixes (F1).
- `EHR_STATUS` + DIRECTORY `If-Match` = double-quoted version_uid (vs the bare form the FLAT
  composition endpoint needs).
- Stored-query `PUT ?type=AQL` + `text/plain` body; the `saved`/`time_created` field name.
- `CONTRIBUTION` listing via `EHR CONTAINS CONTRIBUTION` AQL (container support is
  version-dependent; falls back to empty list).
- `version_at_time` query param on the versioned-composition `/version` endpoint.

Verify with: `docker compose --profile demo up -d --wait` → `pnpm seed:templates` → exercise the
workbench (compose → write → read-back → AQL) and the dev probes in `scripts/dev/`.

## 5. Deferred layers (tracked elsewhere)

- **Governance / audit / observability** — removed in the 2026-05-30 core-refocus; restore before
  any real-patient deployment. See CLAUDE.md → "Deferred (post-core)" and the
  `refactor/strip-governance-core-focus` branch history.
- **Clinical surfaces (Phase 2)** — patient spine + vitals → problems/meds/allergies → labs →
  orders → notes, built on this foundation. See `~/.claude/plans/`.
