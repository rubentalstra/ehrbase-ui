# ADR-0022 — Terminology server: Snowstorm

- **Status:** Accepted
- **Date:** 2026-05-28
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

openEHR archetypes bind coded fields to external terminologies (SNOMED CT, LOINC, ICD-10, ATC) via the FHIR `ValueSet/$expand` operation. The clinical UI needs a terminology server to:

1. Validate clinician input (autocomplete against SNOMED CT for problems, allergies; LOINC for labs; ATC for medications).
2. Resolve coded values to display labels in the active locale.
3. Drive ValueSet binding validation in EHRbase (the CDR can validate inbound compositions against a configured terminology server — see EHRbase docs §7 Terminology Validation).

Two main self-hostable options:

- **CSIRO Ontoserver** — premium SNOMED support, hosted reference instance at `r4.ontoserver.csiro.au`. **Caveat:** non-commercial use is free; production deployment requires a CSIRO licence.
- **Snowstorm** — SNOMED International's own open-source server. Self-host fully. Full SNOMED RF2 release loading. LOINC supported via FHIR-conformant loaders.

User decision (planning round 2, decision #10): **Snowstorm**.

## Decision

**v1.0 uses Snowstorm** (`https://github.com/IHTSDO/snowstorm`) as the terminology server. Self-hosted alongside the rest of the stack. Open source, no licence cost, full control over content.

**Configuration.** EHRbase's `application.yml` points to the Snowstorm FHIR endpoint:

```yaml
validation:
  external-terminology:
    enabled: true
    fail-on-error: true
    provider:
      snowstorm:
        type: fhir
        url: http://snowstorm:8080/fhir
```

The UI layer hits the same endpoint via the BFF for autocomplete + display-label resolution.

**SNOMED CT edition.** v1.0 default = **SNOMED International RF2 release** (latest stable). National extensions (NL Edition, DE Edition, FR Edition, IT Edition, etc.) are deployment-configurable — load the appropriate extension alongside the international module per the SNOMED licence terms in the deployment country.

**LOINC.** Loaded into Snowstorm as a FHIR CodeSystem. Used for lab archetypes (`OBSERVATION.laboratory_test_result.v1`).

**ICD-10.** Loaded into Snowstorm. Used where archetypes bind to ICD-10 (mostly billing-adjacent, less in the clinical surfaces).

**ATC.** Loaded into Snowstorm for medication coding.

**Locale-aware display.** When fetching a code's display label, the UI requests `_displayLanguage=<active locale>` — Snowstorm returns the locale-appropriate label if the loaded module supports it (international SNOMED has English; national extensions add their language). Fallback chain: active locale → English → code-only.

**SNOMED licensing reminder.** SNOMED CT requires an Affiliate Licence from the National Release Centre in the deployment country. The Snowstorm software is open source; the SNOMED content is licensed separately. The deployment guide documents this.

## Consequences

**Positive.** Full control over terminology content. Open source (no licence cost for the software). Direct support from SNOMED International. FHIR-conformant so swapping in CSIRO Ontoserver later is configuration, not code.

**Negative.** Operationally heavier than using a hosted reference instance — Snowstorm needs ~32 GB RAM for the full international SNOMED + extensions in production. Mitigation: documented deployment-sizing guide; dev compose can use the lite mode (international module only, lower memory).

National-extension loading is a per-deployment step (the deployment fetches the extension RF2 release from their National Release Centre and runs the Snowstorm import job). v1.0 ships the international module; extensions are operational documentation.

The Affiliate Licence requirement is non-trivial for some deployments (research / non-clinical) — they may need to start with the international-module-only configuration, which doesn't require a national-level licence in many countries. Deployment guide explains the per-country picture.
