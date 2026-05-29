# ADR-0034 — Pluggable terminology provider (Snowstorm default; Ontoserver / generic-FHIR reserved)

- **Status:** Accepted
- **Date:** 2026-05-29
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

Architecture-doc reference: §0, M9/M10/M12 (terminology consumers). ADR-0022 chose Snowstorm as the v1.0 terminology server. That decision stands; this ADR re-shapes the **consumer side** as pluggable so a deployment can swap Snowstorm for Ontoserver (commercial CSIRO offering) or any FHIR-Terminology-Service-compliant server without code change.

Background:

- **Snowstorm** ([IHTSDO/snowstorm](https://github.com/IHTSDO/snowstorm), Apache 2.0) — self-hosted, Elasticsearch-based, FHIR R4 Terminology Service + a SNOMED-specific REST surface. Latest 10.11.2 (Apr 2026). Strong for SNOMED CT, supports LOINC + ICD-10. Our default.
- **Ontoserver** (CSIRO, commercial) — slightly better search (per April 2025 comparison), easier import via syndication, full ECL. Often selected for production deployments with budget.
- **HAPI FHIR `tx` server** / generic FHIR terminology — any R4-compliant terminology service exposing `$expand`, `$validate-code`, `$lookup`, `$translate`.

The FHIR R4 Terminology Service spec defines a small surface (4 main operations on `ValueSet` + `CodeSystem` + `ConceptMap`). Architecturally identical adapter shape to the demographic provider in ADR-0031.

## Decision

**Terminology data access is pluggable.** Apps consume a `TerminologyProvider` interface; the concrete adapter is resolved at startup from the `TERMINOLOGY_PROVIDER` env var. Default: `snowstorm`.

Provider interface (sketch — full definition in `packages/term-core/src/provider.ts`):

```ts
export interface TerminologyProvider {
  expand(
    input: ExpandValueSetInput,
    ctx: ProviderContext,
  ): Promise<ExpandResult>
  validateCode(
    input: ValidateCodeInput,
    ctx: ProviderContext,
  ): Promise<ValidationResult>
  lookup(input: LookupCodeInput, ctx: ProviderContext): Promise<LookupResult>
  translate(
    input: TranslateInput,
    ctx: ProviderContext,
  ): Promise<TranslationResult>
  autocomplete(
    input: AutocompleteInput,
    ctx: ProviderContext,
  ): Promise<AutocompleteResult>
  readonly capabilities: {
    supportsSnomedEcl: boolean
    supportsLoinc: boolean
    supportsIcd10: boolean
    supportsAtc: boolean
    locales: string[]
  }
}
```

The interface mirrors FHIR R4 Terminology Service operations; the `autocomplete` method is a thin wrapper over `$expand` with a `filter` parameter, named explicitly because it's the highest-frequency UI call.

**v1.0 ships two concrete adapters:**

- **`packages/term-adapter-snowstorm`** — default; `TERMINOLOGY_PROVIDER=snowstorm`. Talks to Snowstorm's FHIR endpoint at `/fhir/`; adds Snowstorm-specific niceties (the `_displayLanguage` parameter, snomed-extension routing).
- **`packages/term-adapter-generic-fhir`** — `TERMINOLOGY_PROVIDER=fhir`. Pure FHIR R4 Terminology Service client; works against HAPI FHIR `tx`, Ontoserver (in basic mode), or any R4-compliant server.

**v1.x reserved slots:**

- `packages/term-adapter-ontoserver` — Ontoserver-specific tweaks (syndication, ECL v2). Most deployments will reach for the generic-FHIR adapter first.

**The FHIR R4 Terminology Service is the canonical wire shape.** No openEHR-TERM-specific wire formats — every adapter speaks FHIR (Snowstorm exposes a FHIR endpoint natively).

**Caching.** All adapters use a thin Valkey-backed cache: per-locale `$expand` results pinned for 1 hour, `$validate-code` for 24 hours. Cache invalidation by terminology server version (Snowstorm's `/fhir/CodeSystem` etag).

**Audit.** Terminology lookups are NOT PHI events. They are NOT routed through `logAudit()`. Volume would drown the audit log; the SNOMED/LOINC code lookups themselves are reference-data reads. The app logs them at debug level in `@ehrbase-ui/observability`.

## Consequences

**Positive.** (a) Decouples the v1.0 default (Snowstorm — open source, EU-friendly) from the consumer code. (b) Hospitals running Ontoserver / HAPI tx / national terminology servers (e.g. Nictiz NL Terminology Server, BfArM DE) plug in via env var. (c) The terminology API surface is the FHIR standard, not a custom shape — interoperability is the default. (d) Adapter contract test suite ensures conformance.

**Negative.** (a) Adapter abstraction adds a tiny indirection for high-volume autocomplete calls. Mitigated by the cache layer. (b) Snowstorm-specific features (extension routing) need explicit capability flags. Mitigated — the capability flags are explicit and the UI degrades gracefully.

**Trade-off vs hardcoded Snowstorm client.** Rejected. Locks v1.0 to one terminology server; loses every Ontoserver / national-terminology-server deployment.

**Trade-off vs OpenAPI-generated client from Snowstorm's spec.** Rejected. Couples to Snowstorm-specific endpoints. The FHIR shape is broader and standard.

## Verification

- `TERMINOLOGY_PROVIDER=snowstorm pnpm dev` — SNOMED autocomplete works; `capabilities.supportsSnomedEcl=true`
- `TERMINOLOGY_PROVIDER=fhir TERMINOLOGY_FHIR_BASE=http://hapi:8080/fhir pnpm dev` — autocomplete works against the generic R4 endpoint; `supportsSnomedEcl=false` (most generic servers don't); UI gracefully falls back to plain-text filter
- Contract test suite under `packages/term-core/__tests__/contract.ts` parametrized over every adapter — green
- Cache hit rate >80% on a synthetic autocomplete workload (typing the same term twice yields one upstream call)
- No `logAudit()` invocations on terminology calls (deliberate — see Decision)
