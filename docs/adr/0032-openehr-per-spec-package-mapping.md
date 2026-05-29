# ADR-0032 — openEHR per-spec package mapping + type-generation strategy

- **Status:** Accepted
- **Date:** 2026-05-29
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

Architecture-doc reference: §0 (new), §7. ADR-0030 chose a monorepo with per-openEHR-spec packages. This ADR records which openEHR specification component maps to which `@ehrbase-ui/*` package, how each package gets its types, and which versions we pin.

The openEHR Foundation publishes specifications as discrete components on [specifications.openehr.org](https://specifications.openehr.org). The community has produced several TypeScript libraries — none are production-grade for clinical software in May 2026:

- **`ehrtslib`** (Erik Sundvall, Apache 2.0, May 2026 active) — most comprehensive, but 6 GitHub stars, no npm releases, self-described "experimental", no contract test suite.
- **`medblocks-ui`** — last release May 2023 (~3 years stale); Lit + Shoelace web components, incompatible with our React + shadcn stack.
- **`@bpac/openehr-models`** — 5 years old, abandoned.
- **`@mmt_d/mmt-openehr-types`** — 1 year stale; generated types only.

Depending on any of these for clinical-grade software fails the "production-defensible provenance" bar.

The openEHR Foundation publishes [`openEHR/specifications-ITS-JSON`](https://github.com/openEHR/specifications-ITS-JSON) — official JSON Schema (draft-07) definitions for the RM. EHRbase exposes its OpenAPI surface — orval can generate a typed REST client.

## Decision

**Generate openEHR TypeScript types from authoritative upstream sources.** No third-party openEHR TS library on the dependency graph for v1.0.

Per-spec mapping + version pins (re-verify at every architecture-doc revision per the §"Version-drift discipline" section):

| Package                            | openEHR spec component                                               | Version            | Generation source                                                                                                                                                                        | Generator                                           |
| ---------------------------------- | -------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `@ehrbase-ui/openehr-base`         | BASE — `LOCATABLE_REF`, identifiers, foundational classes            | 1.2.0              | [openEHR/specifications-ITS-JSON](https://github.com/openEHR/specifications-ITS-JSON) BASE schemas                                                                                       | `json-schema-to-zod` + hand-curated runtime helpers |
| `@ehrbase-ui/openehr-rm`           | RM — EHR IM + Demographic IM + Common + Data Types + Data Structures | 1.1.0              | openEHR/specifications-ITS-JSON RM schemas                                                                                                                                               | `json-schema-to-zod`                                |
| `@ehrbase-ui/openehr-am`           | AM — ADL2 / AOM2 / OPT                                               | 2.3.0              | Hand-typed against the [AM 2.3.0 spec](https://specifications.openehr.org/releases/AM/Release-2.3.0); narrowly scoped — only the OPT subset we actually parse for web-template hydration | hand                                                |
| `@ehrbase-ui/openehr-aql`          | AQL — query language                                                 | 1.1.0              | Hand-typed query AST + builder; CodeMirror grammar for the editor (M16)                                                                                                                  | hand                                                |
| `@ehrbase-ui/openehr-proc`         | PROC — Task Planning (`WORK_PLAN`/`TASK_PLAN`/`PLAN_ITEM`)           | 1.7.0              | openEHR JSON Schema PROC subset (when published) + hand types                                                                                                                            | hybrid                                              |
| `@ehrbase-ui/openehr-cds`          | CDS — GDL2-aligned rule model                                        | 2.0.1              | Hand-typed; we model our subset per ADR-0021 (form-based authoring UI, not raw GDL2)                                                                                                     | hand                                                |
| `@ehrbase-ui/openehr-term`         | TERM — terminology data types                                        | 3.0.0              | Hand-typed; the wire shape comes from FHIR R4 Terminology Service (ADR-0034)                                                                                                             | hand                                                |
| `@ehrbase-ui/openehr-its-rest`     | ITS-REST — EHRbase REST API                                          | 1.0.3              | EHRbase OpenAPI spec (2.31.0)                                                                                                                                                            | `orval`                                             |
| `@ehrbase-ui/openehr-flat`         | FLAT / simSDT (Marand)                                               | spec-stable        | [Simplified Data Template](https://specifications.openehr.org/releases/ITS-REST/latest/simplified_data_template.html) + Marand reference                                                 | hand                                                |
| `@ehrbase-ui/openehr-web-template` | Web Template (Marand / EHRbase variant)                              | EHRbase 2.31 shape | EHRbase [web template docs](https://docs.ehrbase.org/docs/EHRbase/Explore/Simplified-data-template/WebTemplate)                                                                          | hand parser, Zod generator                          |

**Regeneration discipline.** Each package containing generated types ships:

- A `pnpm regen` script that re-fetches the upstream schema and re-emits the types
- A committed `.upstream-hash` file capturing the upstream commit SHA / version
- A CI check (`pnpm regen --check`) that fails if upstream has drifted since last commit
- The generated file marked `// AUTOGENERATED — do not edit by hand. Run `pnpm regen` after updating .upstream-hash.`

**ehrtslib remains a reference implementation, not a dependency.** Engineers writing openehr-rm types may consult ehrtslib's class shapes for cross-validation (Apache 2.0 — attribution in our LICENSE notes if any non-trivial logic is borrowed); a runtime dependency on it would fail the production-grade bar.

**FHIR R4 types** (consumed by `packages/demographic-adapter-fhir`) follow the same generation pattern: types generated via `json-schema-to-zod` from the FHIR R4 JSON Schema published on [hl7.org/fhir/R4](https://hl7.org/fhir/R4/).

## Consequences

**Positive.** (a) Provenance defensible to a regulator: every type traces to an official upstream schema with a committed commit-SHA pin. (b) Re-generation is a CI gate, not human discipline — drift is caught automatically. (c) No third-party SDK on the dependency graph means we are not blocked on someone else's release cadence. (d) Splitting per-spec means a researcher tool can consume `@ehrbase-ui/openehr-aql` alone (post v1.0).

**Negative.** (a) Hand-typed packages (AM, AQL, CDS, TERM) are work we own — bugs are ours; cross-version drift in those packages is ours to catch. Mitigated by: contract test suites in each package, narrow scope (we only model the subset our app consumes), `openehr-archetype-reviewer` sub-agent gate. (b) Initial generator wiring is a one-time cost. Mitigated: `json-schema-to-zod` is mature; orval is already configured.

**Trade-off vs adopting ehrtslib.** Rejected for v1.0. Re-evaluate when ehrtslib publishes a stable 1.0.0 on npm with a contract test suite and a non-trivial production deployment history.

**Trade-off vs FHIR-first (skip openEHR RM, use FHIR everywhere).** Rejected — the project's premise (architecture.md §1) is an openEHR-native EHR. FHIR is the integration boundary (demographic, terminology, future-export), not the storage model.

## Verification

- Every generated file under `packages/openehr-*/src/generated/` is reproducible: `pnpm regen --check` is green
- A breaking openEHR-RM upstream change fails `pnpm regen --check` in CI, blocking merge
- `@ehrbase-ui/openehr-rm` and `@ehrbase-ui/openehr-flat` round-trip every CKM v1.0-catalogue archetype (ADR-0016) in unit tests
- `openehr-archetype-reviewer` sub-agent verifies the hand-typed packages match their upstream spec on every PR that touches them
- No imports of `ehrtslib`, `medblocks-ui`, `@bpac/openehr-models`, or `@mmt_d/mmt-openehr-types` in any `package.json` (ESLint rule via `no-restricted-imports`)
