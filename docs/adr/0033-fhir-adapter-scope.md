# ADR-0033 — FHIR adapter scope (R4 only for v1.0; R5/R6 pure-additive)

- **Status:** Accepted
- **Date:** 2026-05-29
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

Architecture-doc reference: §0, M7 milestone. ADR-0031 chose a pluggable demographic provider with a FHIR adapter as one of the v1.0 concrete implementations. This ADR scopes which FHIR version(s), which resources, and which conformance posture.

FHIR landscape (verified 2026-05-29):

| Version       | Status                 | Production adoption                                     | Notes                                                                                                                       |
| ------------- | ---------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **R4** (2019) | LTS / Normative        | **~95% of production hospitals; 40% report it primary** | Mandated by EHDS profiles (EU), US Core IG, ABDM (India); EHR vendor standard; foundation of vitagroup HIP CDR demographics |
| R4B (2022)    | Bridge                 | minor                                                   | R5 backports (e.g. Subscription); functionally R4-compatible                                                                |
| R5 (2023)     | Stable                 | **~5% globally**                                        | No regulatory mandate; major EHRs skipping; "wait for R6" is the dominant pattern                                           |
| R6            | Ballot 4 (May 26 2026) | not yet                                                 | Final publication 2027+; explicit R4 backward compat                                                                        |

EU deployment context: the [European Health Data Space Regulation (EU) 2025/327](https://eur-lex.europa.eu/eli/reg/2025/327/oj) — our regulatory baseline (CLAUDE.md §"Compliance — EU baseline") — references FHIR R4 profiles. R5 is not in scope for EHDS as of May 2026.

The same demographic-adapter-FHIR codebase needs to remain forward-compatible: R6 (with explicit R4 compat) is plausibly relevant 2027–2028.

## Decision

**`packages/demographic-adapter-fhir` ships with R4 mapping only for v1.0.** The adapter is **version-aware** — the public interface accepts `fhirVersion: 'R4' | 'R4B' | 'R5' | 'R6'` config — but only `R4` and `R4B` (functionally identical) are implemented in v1.0. Any other value throws a clear "not implemented for v1.0" error at construction time (not at first request).

**Mapping scope:** Patient resource only. CRUD + search by identifier. The mapping covers every openEHR `PARTY` / `PERSON` / `PARTY_IDENTITY` / `CONTACT` / `ADDRESS` field that has a direct R4 Patient equivalent. Lossy edges:

- `PARTY_RELATIONSHIP.time_validity` → tracked in `Patient.contact.period` for next-of-kin, dropped silently for other relationship types (logged warning); full bidirectional preserved in built-in adapter
- `PartyIdentity.details` rich item-structure → flattened to `Patient.identifier[].value` + `Patient.identifier[].type.text`
- openEHR PARTY versioning → mapped to `Patient.meta.versionId` (FHIR-native versioning)
- Pseudonymisation HMAC-SHA256 — performed app-side before reading FHIR identifiers into audit, never sent to the FHIR server

**Conformance posture:** International Patient Summary (IPS) R4 baseline + extensible identifier system per ADR-0031's national-ID registry. We do NOT claim conformance to US Core (out of EU scope) or any specific national profile in v1.0 — deployments wanting NL-Nictiz / DE-mII / FR-INS-NIR profiles add a thin sub-package (`packages/demographic-adapter-fhir-{nl,de,fr}`) in v1.x.

**FHIR server requirements:**

- R4 (or R4B); `_format=application/fhir+json`
- OAuth 2.0 SMART-on-FHIR or service-token auth (configurable; same `arctic`-based token plumbing as the EHRbase proxy where applicable)
- `CapabilityStatement` advertising at minimum: Patient `read`, `search-type` with `identifier` parameter; `create` + `update` if the deployment wants writes
- Reads cached in Valkey with a short TTL (60s; configurable) to keep up with hospital ADT churn

**R5 / R6 mappers** are pure-additive packages: `packages/demographic-adapter-fhir-r5/` and `packages/demographic-adapter-fhir-r6/`. Each ships its own version-specific mapper but reuses the common adapter shell. No app code in `apps/web` needs to change to add a new version.

**[FHIR R4 ↔ R5 Cross-Version Mappings](https://build.fhir.org/ig/HL7/fhir-cross-version/)** are referenced for the future R5 adapter — we do not run cross-version StructureMap at runtime in v1.0.

## Consequences

**Positive.** (a) v1.0 covers the regulatory + production reality (R4 = EHDS). (b) Version-aware interface means R5 / R6 land as pure-additive packages — no `apps/web` re-touch, no breaking changes to `DemographicProvider`. (c) Clear "not implemented" error at construction prevents silent fallbacks (Inviolable rule 13 — complete features end-to-end).

**Negative.** (a) When R6 publishes (~2027) and a deployment wants it, someone has to write the mapper. Acceptable — R6 explicitly maintains R4 compat for normative resources, so the R6 mapper is mostly identical to R4 with a few field additions. (b) Hospitals on STU3 (pre-R4) are unsupported. Acceptable — STU3 has near-zero EU production deployment and would require its own retired-standard mapper.

**Trade-off vs supporting R4 + R5 + R6 together.** Rejected. R5 is ~5% adopted, will mostly be skipped. Speculative-coverage work. R6 is ballot-stage — implementing now risks rework when the final spec lands.

**Trade-off vs FHIR-version-agnostic ("StructureMap at runtime").** Rejected. StructureMap is heavyweight and itself versioned; running cross-version transforms inside the demographic hot path is excessive complexity for negligible v1.0 benefit.

## Addendum 2026-05-30 — merge + relationships fully implemented (not lossy / out-of-scope)

The original "Mapping scope" above scoped relationships as a lossy edge (next-of-kin only, dropped otherwise) and did not commit to merge. Per Inviolable rule 13 (complete features end-to-end — no "not supported in v1.0" stubs), the FHIR adapter shipped in M7 implements **both, in full, with no lossy edge**:

- **Merge** → FHIR-native `Patient.link`: the source is deactivated and linked `replaced-by` → target; the target is linked `replaces` → source. Full bidirectional lineage preserved. `capabilities.supportsMerge` tracks `allowWrites`.
- **Relationships** → the `RelatedPerson` resource: `patient` = source, the relationship type round-trips **losslessly** via a project code system (`…/fhir/relationship-type`) for **every** `RelationshipType` (not just next-of-kin), `period` = time-validity, and the target party reference is carried in a typed extension (`…/fhir/related-patient`).
- **Deactivation justification** → persisted on the FHIR record via a `…/fhir/deactivation-reason` extension (parity with the built-in's `change_description` column).

All three are exercised by the shared dual-adapter contract suite (`@ehrbase-ui/demographic-core/contract`). The earlier "lossy / next-of-kin-only / merge-deferred" wording is superseded.

The adapter remains **read-only by default** (`allowWrites:false` → `capabilities.readonly:true`); enabling writes turns on the full mutation surface, all capability-gated.

## Verification

- `pnpm test --filter @ehrbase-ui/demographic-adapter-fhir` — R4 mapper round-trips IPS sample Patient bundles
- Constructing the adapter with `{fhirVersion: 'R5'}` throws `R5 mapper not implemented in v1.0` (NOT a silent fallback)
- Integration test against `hapiproject/hapi:v7.x` (R4) — create / read / search / update via the adapter
- Audit event emitted on each adapter call carries `source.adapterName='fhir-r4'` and `source.fhirServerUrl=...` (Inviolable rule 1)
- CapabilityStatement read on startup; writes greyed out in admin UI when `capabilities.readonly = true` (Inviolable rule 4 — i18n strings only)
