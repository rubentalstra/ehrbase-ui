# ehrbase-ui

> The missing open-source web UI for [EHRbase](https://github.com/ehrbase/ehrbase). A patient-centric clinical workspace built directly on the [openEHR](https://specifications.openehr.org/) open standard: dynamic forms generated from openEHR templates, an AQL query workbench, and composition authoring — with Keycloak SSO and a hardened backend-for-frontend in front of EHRbase. TanStack Start + React 19 + shadcn/ui. Built for EU clinical deployments and multi-role from day one (physician / nurse / admin).

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Status: Pre-v1.0](https://img.shields.io/badge/Status-Pre--v1.0-orange)](docs/IMPLEMENTATION_CHECKLIST.md)

## Status

**Pre-v1.0, greenfield — no production users yet.**

The project is being built **engine-first**: the openEHR + EHRbase core is wired end to end before the polished clinical screens are layered on top. Today the live surface is the **Workbench** — a functional, developer-facing console that drives EHRbase through the same auth, BFF, and openEHR pipeline the clinical UI will use. The clinical EPD surfaces (patient banner, vitals, notes, orders, …) build on top of that engine.

> **Core-refocus (2026-05-30).** The governance / compliance layer — the NEN 7513 audit subsystem, the OpenTelemetry observability stack (Tempo / Loki / Prometheus / Grafana), ClamAV scanning, and retention / cold-store — was **removed** to focus the pre-v1.0 build on the openEHR + EHRbase core. These are **deferred, not cancelled**: they return before any deployment touches real patient data. See the "Deferred (post-core)" section in [`CLAUDE.md`](CLAUDE.md). EHRbase still records the openEHR `CONTRIBUTION` committer from the forwarded token.

## What it is

A thin, secure, type-safe UI that speaks openEHR natively instead of hiding it:

- **Dynamic forms from openEHR templates.** Fetch a web template, generate a Zod schema and a recursive field renderer from it, and submit via the FLAT format — no hand-built form per archetype.
- **AQL workbench.** Author and run AQL against EHRbase, with virtualised result tables.
- **Composition authoring + inspection.** Create, view, and version compositions; browse EHRs and the EHR directory.
- **EHR / demographic separation.** Compositions never embed demographics — the subject is always a `PARTY_IDENTIFIED` reference into a pluggable demographic provider (built-in Postgres adapter today).
- **Keycloak SSO + hardened BFF.** OIDC (PKCE) login via Better Auth, role-based access (clinician / admin / audit-reviewer / researcher), break-glass emergency access, rate limiting, CSRF defense, and per-request CSP nonces — all in a backend-for-frontend that proxies EHRbase so the browser never holds an EHRbase token.

### Stack

TanStack Start · React 19 · Tailwind v4 · shadcn/ui · TanStack Table · Paraglide (i18n) · Better Auth → Keycloak (OIDC) · Valkey (sessions / drafts / rate-limit) · PostgreSQL · EHRbase 2.31.0. Node 24 · pnpm 11 · Turborepo · TypeScript 6 · Zod 4 · Vitest · Playwright · Storybook.

## Monorepo layout

Turborepo + pnpm workspaces ([ADR-0030](docs/adr/0030-monorepo-structure.md)).

```
apps/web/                  # the TanStack Start app — routes, components, server functions, BFF
packages/openehr-*         # per-spec libraries: base, rm, am, aql, proc, cds, term, its-rest, flat, web-template
packages/demographic-*     # pluggable demographic provider (built-in core)
packages/term-*            # pluggable terminology provider (snowstorm + generic-FHIR adapters)
packages/{ui,i18n,valkey}  # shared cross-cutting platform packages
packages/config-*          # shared tsconfig / eslint / tailwind configs
```

openEHR types are generated from the official openEHR JSON Schemas — no third-party openEHR SDK on the dependency graph ([ADR-0032](docs/adr/0032-openehr-per-spec-package-mapping.md)). Both the demographic and terminology providers sit behind stable interfaces ([ADR-0031](docs/adr/0031-pluggable-demographic-provider.md), [ADR-0034](docs/adr/0034-pluggable-terminology-provider.md)).

## What works today

- **Auth & BFF** — OIDC login, sessions in Valkey, RBAC, break-glass, rate limiting, CSRF, security headers, EHRbase + demographic proxies, health / readiness probes.
- **openEHR engine** — web-template fetch + cache, Zod-schema generation, dynamic form renderer, FLAT ⇄ STRUCTURED ⇄ CANONICAL conversion, AQL execution.
- **Workbench** — Templates · EHR · AQL · Compose · Compositions · Directory tabs.
- **Demographic provider** — built-in Postgres adapter behind the `DemographicProvider` interface.
- **Foundations** — i18n (every string via Paraglide), accessibility baseline (WCAG 2.2 AA), CI/CD, Docker dev stack.

## What's planned

The clinical EPD surfaces that sit on the engine above — patient header & search, vitals & labs flowsheets, clinical notes, problems / medications / allergies, orders (CPOE), care plans, discharge & referrals, and the admin surfaces. The deferred governance layer (audit / observability / retention) returns before real patient data is involved. Features explicitly out of v1.0 scope (scheduling, embedded DICOM, AI CDS, real-time updates, external PMI / HL7 v2 ADT) are tracked in the [v1.x roadmap](docs/v1.x-roadmap.md).

## Quickstart

Prerequisites: **Node 24**, **pnpm 11**, and a running **Docker** engine.

```bash
pnpm install
cp .env.example .env.local
docker compose up -d --wait    # EHRbase + Keycloak (realm + clients + demo users) + Valkey + Postgres
pnpm dev                       # UI dev server at http://localhost:3000
```

The dev stack applies the Keycloak realm and seeds four demo users (one per role) automatically — production points the config importer at the realm file only and never sees these credentials ([ADR-0036](docs/adr/0036-keycloak-config-as-code.md)). Log in with any [demo account](docs/demo-accounts.md) — e.g. `dev-clinician` / `DevClinician123!`. Keycloak admin console: <http://localhost:8180> (`admin` / `admin`).

Optional service profiles for terminology binding:

```bash
docker compose --profile terminology up -d   # HAPI FHIR terminology server
docker compose --profile snomed up -d         # self-hosted Snowstorm (+ Elasticsearch)
```

Common tasks (Turbo-orchestrated across the workspace):

```bash
pnpm build        # build all packages + the app
pnpm typecheck
pnpm lint
pnpm test         # Vitest (unit + axe)
pnpm e2e          # Playwright
pnpm storybook
```

## Documentation

- **[Architecture](docs/architecture.md)** — the authoritative spec: stack, BFF, dynamic forms, AQL, accessibility, CI/CD. (Sections on the deferred audit / observability layers describe the post-core target, not the current build.)
- **[Clinical UI](docs/CLINICAL-UI.md)** — single source of truth for every EPD surface: openEHR archetype mapping, user journeys, role dashboards, screen catalogue. **Read this before writing any PHI-touching UI code.**
- **[Foundation scope](docs/FOUNDATION-SCOPE.md)** — what the foundation milestone does and does not include.
- **[Demo accounts](docs/demo-accounts.md)** — dev login credentials (one per role) + how the prod-safe seeding works.
- **[AQL catalogue](docs/aql-catalogue.md)** — named, parameterised, version-pinned queries the UI runs.
- **[Implementation checklist](docs/IMPLEMENTATION_CHECKLIST.md)** — build-out tracker.
- **[v1.x roadmap](docs/v1.x-roadmap.md)** — deferred / out-of-scope features.
- **[References](docs/REFERENCES.md)** — every external link the architecture cites + the verified-version table.
- **[ADRs](docs/adr/)** — Architecture Decision Records.

## License

Apache 2.0 — see [`LICENSE`](LICENSE).

## Contributing

Pre-v1.0 and moving fast — everything is a breaking change and that's fine. Please open an issue (templates are in [`.github/`](.github/)) before sending a substantial PR. Open PRs from feature branches into `main`; CI must be green and commits follow Conventional Commits.
