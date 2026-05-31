# Technical Architecture: Open-Source Web UI for EHRbase

> **Repository:** [`rubentalstra/ehrbase-ui`](https://github.com/rubentalstra/ehrbase-ui)
> **Description:** The missing open-source UI for EHRbase. Clinical workspace, dynamic openEHR forms, AQL query builder. TanStack Start + React 19 + shadcn/ui + Keycloak. Built for EU clinical deployments — GDPR-compliant, with a comprehensive audit-log schema that satisfies the EU healthcare-audit baseline (ISO 27799) and the national standards we've checked (NEN 7513 in NL among them).
> **License:** Apache-2.0
> **Version 3.4** — Full version re-verification pass against npm / official release pages. Every entry in the stack table now has both its tracking line (e.g. `v11.3.x`) and the concrete latest verified version stamped next to it (e.g. `current 11.3.0, May 2026`). Six entries got tightened from vague "latest" or major-only to specific minor lines: pnpm `11.x → v11.3.x`, Tailwind `v4.3 → v4.3.x`, Paraglide `latest → v2.18.x`, @eslint-react/eslint-plugin `latest → v5.8.x`, plus CodeMirror precision (`4.x / 6.x → v4.25.x / v6.10.x`) that hadn't persisted across earlier saves. Two entries got hard security floors after verifying recent CVE history: **Keycloak ≥ 26.6.2** (CVE-2026-37981 PII enumeration fix) and **Valkey ≥ 9.1.0** (three use-after-free CVE fixes). Adds new **§5.12 Supply-chain compromise** documenting CVE-2026-45321 (TanStack May 2026 compromise — 84 packages tampered) and the operational defenses that follow: pin TanStack exactly, keep pnpm 11's `minimumReleaseAge: 1440` default on, maintain a CVE-floor list in `package.json` and Dockerfile, run `pnpm audit signatures` in CI. Adds new **"Version-drift discipline"** prose right under the stack table making explicit that the table is a snapshot — the lockfile is the source of truth, Dependabot keeps drift in check, and re-verification happens by web-fetch only, never by recollection. Builds on 3.3 (Pino 10). Supersedes all prior versions.

> **Status: greenfield, pre-v1.0.** This document describes the **v1.0 target architecture** — what gets built, why, and how the pieces fit together. It is not a description of a running system. Until v1.0 ships there are no users, no real patient data, no migrations, no backwards-compatibility obligations, no live audit log, no breach to respond to, no retention clock running. Every change is a breaking change and that is fine. The sequencing of when each piece is built is tracked separately (it is not part of this document). If a sentence sounds like "in production we…" read it as "at v1.0 we will…" — not "today we already do."

> **2026-05-29 structural addenda.** Five ADRs ratified after v3.4 of this document reshape the project structure without changing its intent. Read them before the §-numbered chapters below:
>
> - **[ADR-0030](adr/0030-monorepo-structure.md)** — repo is a Turborepo + pnpm-workspaces monorepo with per-openEHR-spec packages. File-layout language in §16/§17 still describes the _logical_ architecture; physical layout lives under `apps/web/` and `packages/*` per ADR-0030.
> - **[ADR-0031](adr/0031-pluggable-demographic-provider.md)** — supersedes ADR-0023 in shape (not intent). The M7 demographic surface is pluggable: built-in Postgres adapter (default) + FHIR R4 adapter, with HL7v2 + IHE PDQ slots reserved for v1.x.
> - **[ADR-0032](adr/0032-openehr-per-spec-package-mapping.md)** — openEHR types are generated from the official JSON Schemas; no third-party openEHR SDK on the dependency graph.
> - **[ADR-0033](adr/0033-fhir-adapter-scope.md)** — FHIR R4 only for v1.0; R5 / R6 are pure-additive packages.
> - **[ADR-0034](adr/0034-pluggable-terminology-provider.md)** — terminology consumer is pluggable. Snowstorm (ADR-0022) is the v1.0 default; the interface is FHIR R4 Terminology Service.
>
> Milestone count grew from 18 → 19 (new M9 = CDS infrastructure consolidated from old M9/M15/M16). See `docs/IMPLEMENTATION_CHECKLIST.md` and CLAUDE.md Inviolable rule 13. Where this document says `src/...` read `apps/web/src/...` or `packages/<name>/src/...` per ADR-0030.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [EHRbase Reference (Condensed)](#2-ehrbase-reference-condensed)
3. [Architecture Overview](#3-architecture-overview)
4. [TanStack Start — Framework Choices](#4-tanstack-start--framework-choices)
5. [Authentication & BFF Pattern](#5-authentication--bff-pattern)
6. [UI Layer — shadcn/ui + React 19](#6-ui-layer--shadcnui--react-19)
7. [Dynamic Forms from openEHR Templates](#7-dynamic-forms-from-openehr-templates)
8. [AQL Editor & Data Tables](#8-aql-editor--data-tables)
9. [State Management](#9-state-management)
10. [Error Handling Strategy](#10-error-handling-strategy)
11. [Internationalization (i18n)](#11-internationalization-i18n)
12. [Accessibility (WCAG 2.2 AA + EAA + EN 301 549)](#12-accessibility-wcag-22-aa--eaa--en-301-549)
13. [Observability — App Logs, Metrics, Tracing](#13-observability--app-logs-metrics-tracing)
14. [GDPR & EU Healthcare Audit Logging](#14-gdpr--eu-healthcare-audit-logging)
15. [Type-Safe API Client](#15-type-safe-api-client)
16. [Project Structure](#16-project-structure)
17. [PNPM, Tooling & Conventions](#17-pnpm-tooling--conventions)
18. [Docker Deployment](#18-docker-deployment)
19. [Environments & Secrets](#19-environments--secrets)
20. [CI/CD Pipeline](#20-cicd-pipeline)
21. [Backup & Disaster Recovery](#21-backup--disaster-recovery)
22. [Performance Budgets](#22-performance-budgets)
23. [Browser Support Matrix](#23-browser-support-matrix)
24. [Testing Strategy](#24-testing-strategy)
25. [Governance, License, Repository Layout](#25-governance-license-repository-layout)
26. [Risks & Mitigations](#26-risks--mitigations)
27. [References](#27-references)

---

## 1. Executive Summary

This document describes the architecture of an open-source web UI for the **EHRbase** openEHR clinical data repository. The application is a clinical workspace for healthcare professionals — viewing patient EHRs, entering structured clinical data via dynamically generated forms, running AQL queries, and administering templates.

**Why this project exists.** EHRbase is a mature, Apache-2.0 openEHR server, but the ecosystem lacks a comprehensive, modern, open-source UI. Existing options are either commercial (Better Platform), aging demos, or framework-specific component libraries (Medblocks UI, Better UI Components). This project fills that gap with a React 19 + TanStack Start application designed for clinical workflows from day one.

**Stack at a glance** (every version verified against npm/official release page on May 26, 2026 — see §27 for source links; the version-drift discipline that keeps this table honest is described directly below it).

| Concern                      | Choice                                                                                             | Version                                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Runtime                      | **Node.js** (LTS "Krypton")                                                                        | **24.x** (current 24.15.0, Apr 2026)                                                       |
| Package manager              | **pnpm** (security defaults on by default)                                                         | **v11.3.x** (current 11.3.0, May 2026)                                                     |
| Framework                    | **@tanstack/react-start** (RC)                                                                     | **1.168.13** (May 25, 2026; post-supply-chain-cleanup — see §5.x)                          |
| UI runtime                   | **React**                                                                                          | **19.2.6** (May 2026)                                                                      |
| Server-state cache           | **@tanstack/react-query**                                                                          | **5.100.14** (May 2026)                                                                    |
| Routing                      | **@tanstack/react-router** (bundled with Start)                                                    | matched                                                                                    |
| Components                   | **shadcn/ui** (copied via CLI, no runtime dep)                                                     | latest registry                                                                            |
| Styling                      | **Tailwind CSS** (CSS-first `@theme`)                                                              | **v4.3.x** (current 4.3.0, May 2026)                                                       |
| Form library                 | **react-hook-form** + **@hookform/resolvers**                                                      | rhf 7.x, resolvers ≥5.1                                                                    |
| Schema validation            | **Zod**                                                                                            | **v4**                                                                                     |
| i18n                         | **Paraglide JS** (`@inlang/paraglide-js`, compiler-based, TanStack-recommended)                    | **v2.18.x** (current 2.18.1, May 2026)                                                     |
| Code editor (AQL)            | **@uiw/react-codemirror** + `@codemirror/lang-sql`                                                 | **v4.25.x** / **v6.10.x** (current 4.25.10 / 6.10.0)                                       |
| Backend (proxied)            | **EHRbase** (pinned, never `:latest`)                                                              | **2.31.x** (current 2.31.0, Apr 28 2026 — Java 25)                                         |
| Identity                     | **Keycloak** (OIDC + PKCE)                                                                         | **≥ 26.6.2** (CVE-2026-37981 fix — see §5.x note)                                          |
| Session + audit-chain store  | **Valkey** (BSD-licensed Redis fork, drop-in)                                                      | **≥ 9.1.0** (3 CVE fixes — see §5.x note)                                                  |
| Logging                      | **pino** (separate transports: app, audit)                                                         | **v10.x** (current 10.3.x, May 2026)                                                       |
| Database (EHRbase, Keycloak) | **PostgreSQL**                                                                                     | **18.x** (current 18.4, May 14 2026)                                                       |
| Build / dev                  | **Vite** (Vite 8 GA but blocked on TanStack Start integration bugs; see §17 "Vite version policy") | **v7.3.x** for v1.0 (current 7.3.3, May 2026)                                              |
| Linter                       | **ESLint** (flat config)                                                                           | **v10.x** (current 10.4.0, May 2026)                                                       |
| TypeScript linting           | **typescript-eslint**                                                                              | **v8.x** (current 8.60.0, May 25 2026)                                                     |
| React linting                | **`@eslint-react/eslint-plugin`** (`eslint-plugin-react` is still broken on ESLint 10)             | **v5.8.x** (current 5.8.5, May 25 2026)                                                    |
| React Hooks linting          | **`eslint-plugin-react-hooks`** (v7 has ESLint 10 support)                                         | **v7.x** (current 7.1.1)                                                                   |
| Accessibility linting        | **`eslint-plugin-jsx-a11y-x`** (actively-maintained fork)                                          | latest (recent: May 10 2026)                                                               |
| Container                    | **Docker / docker-compose**                                                                        | engine **29.x** (current 29.4.3, May 18 2026; containerd is default image store from 29.0) |
| License                      | **Apache 2.0**                                                                                     | —                                                                                          |

### Version-drift discipline (how this table stays honest)

The stack table above is a snapshot of authoritative sources on the date stamped at its head. It is **not** the source of truth for actual installed versions — `package.json` + the Dockerfile + `pnpm-lock.yaml` are.

Three things keep drift between this document and reality from accumulating:

1. **Dependabot** runs daily for npm dependencies and weekly for Docker base images / GitHub Actions, opening PRs for any pinned version that has moved (§20.8).
2. **CI fails the build** if `package.json` and `pnpm-lock.yaml` are out of sync (§20.3).
3. **This table is re-verified at every revision of this document** by web-fetching the npm registry or official release page for each entry, never by recollection. The first time a version is updated in this table without a fresh fetch, the document has started lying.

If you're reading this table more than a few months after the date at its head and need authoritative current numbers: trust the lockfile, not this page.

**Two version choices that need explaining:**

- **Valkey, not Redis.** Redis Ltd. relicensed Redis to SSPL/AGPL in 2024-2025. The Linux Foundation forked the last BSD-licensed Redis (7.2.4) as **Valkey**, now backed by AWS, Google Cloud, Oracle, and used by Pinterest, Snap and X. Bringing AGPL into an Apache-2.0 open-source clinical app would be a procurement blocker for many hospitals. Valkey is wire-compatible — `ioredis` and every other Redis client just works. No code change required.
- **PostgreSQL 18, not 16.** Postgres 18 (released Sep 2025) ships async I/O for major performance gains. Postgres 16 is supported until Nov 2028, but we're starting fresh, so we start on the latest. EHRbase itself requires Postgres 15+ and recommends 16+; 18 is also supported.

**Deployment context.** Designed for self-hosted clinical environments **across the European Union**. The legal baseline is **GDPR + the European Health Data Space (EHDS) Regulation**, layered with whichever national healthcare-records laws and supervisory-authority rules apply at the deployment site (NL: NEN 7510/7512/7513 + WGBO + AVG; DE: §203 StGB + KHZG + IT-SiG 2.0 + national e-prescription rules; FR: PGSSI-S + Référentiels CNIL santé; and so on). The code makes no NL-specific assumption — retention periods, national patient-identifier formats, supervisory-authority contact details and DPIA boilerplate are all configuration the deployment fills in. Security and audit logging are _first-class_ concerns, not afterthoughts.

**Core design decisions.**

1. **Hybrid SSR** (`ssr: 'data-only'`) — server-side data loading with auth gating, client-side rendering for full interactivity.
2. **BFF inside the same process** — Keycloak OAuth and EHRbase calls go through TanStack Start server functions and server routes. Browser never sees access tokens.
3. **Single deployable unit** — UI + BFF in one Node process. Valkey and EHRbase are separate services.
4. **Component ownership** — shadcn/ui components are copied into the repo. Custom code is reserved for openEHR-specific concerns (dynamic forms, composition viewer, AQL editor).
5. **Audit logging is code-shape, not afterthought** — every PHI-touching server function calls `logAudit()`. The hash chain, pseudonymization, integrity job and persistent store all sit behind that one helper, so server-function code never has to care about how audit gets persisted. Retrofitting audit calls into hundreds of server functions later is how organizations end up in GDPR fine tables; designing the call shape up front avoids that.

**Explicitly NOT in v1.0** (deferred deliberately, not forgotten — every item below has a tracking stub in [`docs/v1.x-roadmap.md`](v1.x-roadmap.md)):

- **Scheduling / appointments** (full clinic calendar, room booking, slots, waitlist, recurring appointments). Scheduling is its own product surface — HIX/Epic spend a large share of their UX budget on it. openEHR has no native scheduling model; v1.x scoping will combine ADMIN_ENTRY for the appointment record + PROC for recurring/series logic.
- **Real-time updates** (WebSocket / SSE for new lab results, new alerts). React Query polling is sufficient at v1.0 scale; real-time is a v2 capability that needs its own DPIA addendum for the persistent-channel risk.
- **Embedded DICOM viewer**. v1.0 ships a document viewer (PDF + image) plus a DICOM listing that hands off to the hospital's PACS viewer via external link (ADR-0020). Embedded viewer (Cornerstone.js / OHIF) is v1.x.
- **AI / LLM clinical decision support.** v1.0 ships deterministic rule-based CDS only (GDL2-aligned, ADR-0021). AI-based CDS triggers separate DPIA + Art. 22 considerations; v1.x.
- **External Patient Master Index (HL7 v2 ADT) integration.** v1.0 ships the M7 openEHR-spec demographic service as the standalone source-of-truth (ADR-0023). The adapter contract is openEHR-PARTY-shaped, so a v1.x PMI integration plugs in without UI changes.
- **Real GDL2 execution engine integration.** v1.0's native rule evaluator uses a GDL2-aligned internal format. Real GDL2 engine = v1.x when ecosystem tooling matures.
- **EHDS cross-border features (MyHealth@EU).** EHDS timeline puts patient-summary / ePrescription / eDispensation exchange at 26 Mar 2029; medical images / lab results / discharge reports at 26 Mar 2031. v1.0 ships the data layer EHDS-compatible (CANONICAL composition export → FHIR Bundle).
- **Patient portal beyond `/me/access-log`.** Article 15 access log is in v1.0; full patient-facing UI (own record view, messaging with care team, appointment requests, consent management) is v1.x.
- **Offline / PWA mode.** Hospital deployments are connected by design. Offline composition entry for home-visit nursing is a separate product configuration.
- **Server-side PDF generation.** Browser print-to-PDF covers the v1.0 print use cases (ADR-0020); server-side PDF adds Chromium attack surface and the PDF/A archive concern (§6.x). v1.x.
- **Federated identity broker config** (UZI-pas, DigiD, e-PA, etc.). The app speaks standard OIDC to Keycloak; configuring the upstream IdP is a hospital deployment concern, not an app-layer one (§5.6).
- **Multi-tenant isolation** (one app instance serving multiple hospitals). Each hospital runs its own instance; multi-tenancy is a v2 product question, not an architectural one.
- **ML-based anomaly detection** for the audit-review dashboard. v1.0 ships explicit heuristic rules; learned-model anomaly detection (§14.13) is post-v1.0.
- **Native mobile apps**. The web app must be fully usable on tablet at the bedside (§12 target-size compliance enforces this); a native iOS/Android app is out of scope.

---

## 2. EHRbase Reference (Condensed)

**Project:** https://github.com/ehrbase/ehrbase · Apache 2.0 · Latest stable **v2.31.x** (April 2026).

**REST API surface** (mounted at `http(s)://<host>/ehrbase/rest/openehr/v1`):

| Endpoint                           | Method             | Purpose                                                                                                     |
| ---------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `/ehr`                             | POST               | Create new EHR                                                                                              |
| `/ehr/{ehr_id}`                    | GET / PUT          | Retrieve / replace EHR                                                                                      |
| `/ehr/{ehr_id}/composition`        | POST               | Create composition (`?format=FLAT` recommended for UI)                                                      |
| `/ehr/{ehr_id}/composition/{uid}`  | GET / PUT / DELETE | Manage composition versions                                                                                 |
| `/query/aql`                       | POST               | Execute AQL query                                                                                           |
| `/definition/template/adl1.4/{id}` | GET                | Operational template; with `Accept: application/json` returns the **web template** used for form generation |
| `/admin/*`                         | various            | Admin API (requires `ADMIN` role)                                                                           |

**Three composition formats** — the UI uses **FLAT** for data entry (flat key/value, simplest to map to form state), **STRUCTURED** for read-back, **CANONICAL** for export and inter-system exchange.

**Web Template** = JSON describing the form structure derived from an operational template. Tree of nodes; each leaf has an `rmType` (DV_TEXT, DV_QUANTITY, DV_CODED_TEXT, …) and optional `inputs[]` constraints. This is what the dynamic form renderer consumes (see §7).

**No comprehensive open-source UI exists today.** Validated again in this revision. This project is the first such effort with this stack.

**EHR and Demographic information are logically separate** per the openEHR BASE architecture overview: _"One of the basic principles of openEHR is the complete separation of EHR and demographic information, such that an EHR taken in isolation contains little or no clue as to the identity of the patient it belongs to."_ EHRbase implements only the **EHR side** of the openEHR spec — its REST surface (ITS-REST Release 1.0.3) exposes `/ehr/*`, `/query/aql`, `/definition/template/*`, `/admin/*`, with no `/demographic/*` endpoints. Compositions reference subjects via `PARTY_PROXY` / `PARTY_SELF` / `PARTY_IDENTIFIED` (with `external_ref.id.namespace + value`) — these are references into a demographic store, not the demographic data itself. **We build the openEHR-spec demographic side ourselves as a module in this app** (M7; ADR-0023) — own Postgres schema, own REST surface (`/api/demographic/*`), implementing `PERSON` / `PARTY_IDENTITY` / `CONTACT` / `ADDRESS` / `ROLE` / `PARTY_RELATIONSHIP`.

For the clinical-UI surfaces that consume these data models — the patient banner, problem list, vitals, labs, orders, care plan, discharge, referrals, and the rest — the single source of truth is [`docs/CLINICAL-UI.md`](CLINICAL-UI.md). It maps each EPD surface to its openEHR entry class, CKM archetype IDs, operational template, composition format, AQL queries, audit events, CDS rules, and role gating. **Read it before writing any PHI-touching UI code.**

---

## 3. Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        Browser                               │
│  React 19 + shadcn/ui  •  TanStack Query  •  TanStack Router │
│                            │                                 │
│              httpOnly Secure SameSite=Lax cookie             │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTPS
┌──────────────────────────────▼───────────────────────────────┐
│              TanStack Start (Node 24 LTS)                    │
│  ─ SSR shell (data-only mode for authed routes)              │
│  ─ Server functions  → patient/template/AQL business logic   │
│  ─ Server routes     → /api/auth/*  (OIDC flow)              │
│                       /api/ehrbase/*  (authenticated proxy)  │
│  ─ Middleware        → auth, audit, correlation-id, CSP      │
└────────┬────────────────────────────────────┬────────────────┘
         │                                    │
         │ session lookup,                    │ Bearer token
         │ audit hash chain                   │
         ▼                                    ▼
   ┌───────────┐                       ┌─────────────┐
   │  Valkey 9 │                       │ Keycloak 26 │
   │ (sessions │                       │   (OIDC)    │
   │  + audit  │                       └─────────────┘
   │  chain)   │                              ▲
   └───────────┘                              │ JWT validation
         │                                    │
         │                                    │
         │                              ┌─────┴─────────┐
         │       audit events to        │ EHRbase 2.31  │
         └─────────────────────────────►│ + Postgres 18 │
                  (Loki + cold S3)      │  (openEHR)    │
                                        └───────────────┘
```

**Service inventory (all containers):**

| Service          | Image                                                  | Notes                                                      |
| ---------------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| `ui`             | this project                                           | TanStack Start + BFF, Node 24                              |
| `valkey`         | `valkey/valkey:9-alpine`                               | Sessions + audit hash-chain head (BSD-licensed Redis fork) |
| `keycloak`       | `quay.io/keycloak/keycloak:26.6`                       | OIDC provider                                              |
| `ehrbase`        | `ehrbase/ehrbase:2.31.x` (pinned, **never `:latest`**) | openEHR server, requires Java 25 in container              |
| `ehrbase-db`     | `postgres:18-alpine`                                   | EHRbase's database                                         |
| `keycloak-db`    | `postgres:18-alpine`                                   | Keycloak's database                                        |
| `loki`           | `grafana/loki:3.x`                                     | Log aggregation (optional in dev)                          |
| `grafana`        | `grafana/grafana:11.x`                                 | Log/metrics viewer (optional in dev)                       |
| `otel-collector` | `otel/opentelemetry-collector-contrib:0.x`             | Receives OTLP, redacts PHI, fans out to backends           |
| `tempo`          | `grafana/tempo:2.x`                                    | Distributed trace storage (OTLP-native)                    |
| `prometheus`     | `prom/prometheus:3.x`                                  | Metrics storage (receives via OTLP from collector)         |

---

## 4. TanStack Start — Framework Choices

### Why TanStack Start

- **Type-safe routing end-to-end** — params, search, loaders all typed without manual annotation.
- **Deployment flexibility** — Nitro-based; runs on Node, Docker, Cloudflare, Vercel, Netlify.
- **Explicit server boundary** — `createServerFn` and server routes make the BFF surface obvious in code review.
- **Vite under the hood** — fast HMR, simple build.
- **No vendor lock-in** — pure standards (Web Fetch API, Web Streams).

### Maturity caveat

As of writing, `@tanstack/react-start` is at **Release Candidate (1.168.x)**. The API is feature-complete and stable since the Vinxi→Vite migration (v1.120+). Production deployments exist. **We pin every TanStack dependency exactly** (no `^`, no `~`) and gate upgrades through a PR with full test pass.

### SSR mode for this app

We use **`ssr: 'data-only'`** for every authenticated route. The server runs `beforeLoad` (auth check) and `loader` (data fetch with audit log), then ships loader data to the client which renders interactively. This gives us:

- Secure server-side data loading (tokens stay server-side)
- Auth gating at the route level (no flash of protected content)
- Full React interactivity (no RSC complexity)
- Easier debugging (one render pass on client)

Public routes (`/`, `/login`, error pages) use default SSR. The OIDC callback uses `ssr: true` because it must run server-only.

### Server functions vs. server routes

| Pattern                                     | Use for                                                                                                                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createServerFn`                            | Typed RPC called from client components/loaders. Most business logic lives here. **Note:** in current API the validator chain method is `.inputValidator(...)`. |
| Server route (file in `src/routes/api/...`) | REST-style endpoints. Used for the OAuth callback (must be a real URL), the EHRbase pass-through proxy, and health/readiness probes.                            |

---

## 5. Authentication & BFF Pattern

> **Implementation note (2026-05-28).** [ADR-0028](adr/0028-better-auth-migration.md) replaces the M2 Arctic-based stack with **Better Auth** (Drizzle-backed in a dedicated `auth` database, ADR-0029) layered with the **SSO + admin + organization (+ teams)** plugins. Keycloak remains the IdP; Better Auth is the OIDC client. The "Why BFF" rationale below is unchanged — OAuth tokens still live server-side, the browser still holds only an opaque session cookie. The Authorization-Code-+-PKCE handshake is now run by Better Auth's SSO plugin instead of Arctic; the per-endpoint M2 routes (`/api/auth/login`, `/callback`, `/logout`) are replaced by a catch-all at `/api/auth/$` that dispatches to Better Auth's internal router. The §-numbered sections below describe the M2 surface for historical context — current code lives in `src/lib/auth/auth.server.ts` + `src/lib/auth/require-auth.server.ts` + `src/lib/auth/require-role.server.ts`.

### Why BFF

Browser-side tokens are an unacceptable risk for clinical data. The BFF pattern keeps OAuth tokens **server-side** inside the TanStack Start process. The browser holds only an opaque, encrypted session cookie. XSS becomes a per-session compromise rather than a token-theft incident.

### Authorization Code + PKCE flow

1. Browser → `/api/auth/login` → server generates state + PKCE verifier → redirect to Keycloak.
2. User authenticates at Keycloak.
3. Keycloak redirects to `/api/auth/callback?code=...&state=...`.
4. Server validates state, exchanges code for tokens, **stores tokens in Valkey keyed by session ID**, sets httpOnly session cookie holding only the session ID.
5. Subsequent API calls: middleware reads session ID from cookie → looks up tokens in Valkey → refreshes if near expiry → calls EHRbase with `Authorization: Bearer ...`.
6. Logout: server destroys Valkey session, expires cookie, calls Keycloak end-session.

### Session store: Valkey (not iron-session)

We use **Valkey from day one** because:

- The audit hash chain (§14) needs a fast key-value store anyway.
- Server-side session storage allows **immediate revocation** (logout, admin disable, breach response).
- Per-session token rotation without cookie size bloat.
- Multi-instance scaling (`pnpm run dev` → single instance; production → multiple replicas).

Cookie carries **only** a 32-byte random session ID, not the tokens themselves. Session ID is a randomly generated string used as a Valkey key.

### Cookie attributes (production)

```
Set-Cookie: ehrbase_sid=<random>;
  HttpOnly;
  Secure;
  SameSite=Lax;
  Path=/;
  Max-Age=28800        // 8 hours sliding
```

`SameSite=Lax` is sufficient because our OAuth callback is a top-level navigation (state parameter handles CSRF). Use `SameSite=Strict` if no cross-site embedding is ever needed.

### Code sketches

```ts
// src/lib/session.server.ts
import { createServerOnlyFn } from '@tanstack/react-start'
import Redis from 'ioredis' // works against Valkey unchanged (wire-compatible)
import { randomBytes } from 'crypto'

const valkey = new Redis(process.env.VALKEY_URL!)
const SESSION_TTL_SECONDS = 8 * 60 * 60

export type SessionData = {
  status: 'authenticated' | 'authenticating'
  userId?: string
  email?: string
  name?: string
  roles?: string[]
  accessToken?: string
  accessTokenExpiresAt?: number
  refreshToken?: string
  // PKCE bookkeeping (only when status='authenticating')
  state?: string
  codeVerifier?: string
  postLoginRedirect?: string
}

export const createSessionId = createServerOnlyFn(() =>
  randomBytes(32).toString('hex'),
)

export async function readSession(sid: string): Promise<SessionData | null> {
  const raw = await valkey.get(`sess:${sid}`)
  return raw ? JSON.parse(raw) : null
}

export async function writeSession(sid: string, data: SessionData) {
  await valkey.set(
    `sess:${sid}`,
    JSON.stringify(data),
    'EX',
    SESSION_TTL_SECONDS,
  )
}

export async function destroySession(sid: string) {
  await valkey.del(`sess:${sid}`)
}
```

```ts
// src/routes/api/auth/login.ts
import { createFileRoute, redirect } from '@tanstack/react-router'
import { generateState, generateCodeVerifier } from 'arctic'
import { setCookie } from '@tanstack/react-start/server'
import { createSessionId, writeSession } from '~/lib/session.server'
import { keycloak } from '~/lib/auth/keycloak.server'

export const Route = createFileRoute('/api/auth/login')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const state = generateState()
        const codeVerifier = generateCodeVerifier()
        const url = keycloak.createAuthorizationURL(state, codeVerifier, [
          'openid',
          'profile',
          'email',
          'offline_access',
        ])

        const sid = createSessionId()
        await writeSession(sid, {
          status: 'authenticating',
          state,
          codeVerifier,
          postLoginRedirect:
            new URL(request.url).searchParams.get('redirect') ?? '/',
        })
        setCookie('ehrbase_sid', sid, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 10, // 10 min to complete login
        })
        throw redirect({ href: url.toString() })
      },
    },
  },
})
```

```ts
// src/lib/auth/require-auth.server.ts
import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { readSession, writeSession } from '~/lib/session.server'
import { refreshIfExpiring } from './refresh.server'

export const requireAuth = createServerFn().handler(async () => {
  const sid = getCookie('ehrbase_sid')
  if (!sid) throw new Response('Unauthorized', { status: 401 })

  const session = await readSession(sid)
  if (!session || session.status !== 'authenticated') {
    throw new Response('Unauthorized', { status: 401 })
  }

  const refreshed = await refreshIfExpiring(sid, session)
  return {
    sid,
    user: {
      id: refreshed.userId!,
      email: refreshed.email!,
      name: refreshed.name!,
      roles: refreshed.roles ?? [],
    },
    accessToken: refreshed.accessToken!,
  }
})
```

### 5.6 Roles, authorization & break-glass emergency access

**Role model (v1.0).** Roles come from Keycloak realm claims; the app reads them off the session. Four roles ship in v1.0:

| Role             | Can                                                                                                                                              | Cannot                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `clinician`      | Read PHI for patients in their care relationship; write compositions; run AQL scoped to those patients                                           | Read PHI for other patients (without break-glass); manage users; review audit log |
| `admin`          | Manage templates, users, roles, configuration                                                                                                    | Read PHI (without break-glass)                                                    |
| `audit-reviewer` | Read the audit log; run the sample-of-60 review dashboard (the NL national-standard cadence we adopt as the EU-baseline review SLA — see §14.13) | Read PHI directly                                                                 |
| `researcher`     | Read pseudonymized PHI; full AQL access against pseudonymized dataset                                                                            | Read identifying fields (name, national patient identifier, address)              |

Enforcement happens at one place: a `requireRole(...roles)` middleware that wraps every server function that touches PHI. The `requireAuth` middleware (already in §5.2) is the parent — `requireRole` builds on it. Pure RBAC denials return 403 and emit an audit event of type `AUTHZ_DENIED`.

**Hospital deployments configure their own role mapping.** A Keycloak realm at one hospital might map LDAP groups to these four roles; another might federate via UZI-pas (smartcard) and derive roles from BIG number role codes. The app does not care — it only sees claims at the OIDC layer.

**Break-glass emergency access (GDPR Art. 9(2)(c) "vital interests").** A standard EU clinical-operations pattern (IHE BPPC, ISO/TS 22600 "Privilege management and access control") used by every national hospital regime we've checked: a clinician must be able to reach records of a patient outside their normal care relationship in life-threatening situations, with an auditable trail of justification.

The pattern, per IHE BPPC and EHRbase deployments at EU academic hospitals:

1. When a clinician hits an RBAC 403 on a patient-PHI route, the response includes a `break-glass: available` hint instead of just a generic denial.
2. The UI shows a "Request emergency access" button with a clear warning: "This will grant access, write a special audit entry, and notify the audit-reviewer team within 24h. Use only for genuine clinical emergencies."
3. Clicking it opens a modal requiring a **free-text justification** (minimum 30 chars, e.g. "Patient in ER, unconscious, need allergy history"). No template choices — the requirement is that a human writes prose another human can read.
4. On submit, the server writes a special audit event (`event_type: 'EMERGENCY_ACCESS_GRANTED'`, full justification, the role-denial it overrode, source IP) and grants a **time-limited grant** (60 minutes, then automatic revocation requiring re-justification).
5. Hard ceiling: max **3 emergency-access invocations per session**; the 4th forces logout + re-authentication with a re-typed justification.
6. The audit-reviewer dashboard (§14) highlights all `EMERGENCY_ACCESS_GRANTED` events and surfaces them for the mandatory **24h human review SLA**.

This is not optional. EU clinical deployments without a documented break-glass pattern fail their national IT-security audits — NL deployments have failed NEN 7510 audits on this specific point, and the equivalent finding shows up under ISO 27799 / national audit regimes elsewhere. The pattern needs to exist in the code from day one of clinical use, not bolted on later.

### 5.7 Security headers

Every authenticated response sets the following headers via a TanStack Start middleware that runs after auth resolution. Values below are the v1.0 baseline; the policy is implemented via [helmet](https://helmetjs.github.io)-equivalent middleware running per-request to allow nonce injection.

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{REQ-NONCE}' 'strict-dynamic';
  style-src 'self' 'nonce-{REQ-NONCE}';
  img-src 'self' data: blob:;
  font-src 'self';
  connect-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
X-Frame-Options: DENY
Cache-Control: no-store, no-cache, must-revalidate, private    # all authed routes
```

**Why nonce + `strict-dynamic` instead of `unsafe-inline`** — strict CSP is OWASP's recommended XSS defense ([CSP Cheat Sheet, 2026](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)). Per-request nonce + `strict-dynamic` lets React's hydration work without allowing arbitrary inline scripts. Because TanStack Start does SSR (§4), we can inject a fresh nonce per request — this is the strategy that doesn't work in pure SPAs.

**Why `frame-ancestors 'none'`** — the clinical UI must never be embeddable in another site (clickjacking → unauthorized PHI access). Hospital intranets that need to embed parts of the app deploy a separately-configured restricted policy.

**Why `Cache-Control: no-store` on every authed route** — PHI must never land on disk in the browser cache, the proxy cache, or anywhere else. Static assets (the bundled JS/CSS, fonts, icons) are served from a separate origin or path with long-cache headers; PHI-bearing JSON and HTML are always `no-store`. This is the same pattern HIPAA-compliant deployments use.

**Reporting** — `Content-Security-Policy-Report-Only` runs in shadow alongside the enforcing policy during development and in staging, posting violations to `/api/csp-report`. We do not enable CSP reporting in production because the violation reports themselves can leak URLs (potential PHI). All policy tightening happens in staging first.

### 5.8 CSRF defense

Three layers, in order of strength:

1. **`SameSite=Lax` session cookie** (already in §5.4) — blocks most cross-site POST attacks at the browser level.
2. **Server-function Origin/Referer check** — every mutating TanStack Start server function (createServerFn with method `POST`) has middleware that rejects requests whose `Origin` header is not in the allow-list. The allow-list is the configured public URL of the deployment (single entry in v1.0). Requests with no `Origin` are also rejected for mutations.
3. **Per-form CSRF token** for high-impact mutations only (template delete, role change, emergency-access invocation, audit-log export). Token is bound to the session, single-use, 5-minute TTL. Stored in Valkey alongside the session. This is belt-and-braces — the SameSite + Origin check is already sufficient — but the operations are sensitive enough that we want explicit token verification.

The OAuth callback uses the OAuth `state` parameter as already described in §5.4; that is unchanged.

### 5.9 Rate limiting

All rate limits are Valkey-backed sliding windows. Keys are scoped per session ID (authenticated) or per source IP (unauthenticated). Implementation: `rate-limiter-flexible` npm package against the Valkey instance from §5.3.

| Endpoint class                                  | Limit                                 | Action on breach                               |
| ----------------------------------------------- | ------------------------------------- | ---------------------------------------------- |
| Login (Keycloak realm config, not app-layer)    | 5 failed attempts / 15 min / username | Realm-level lockout, configurable per hospital |
| AQL query execution                             | **60 / minute / session**             | 429 + 60s cooldown                             |
| AQL query complexity (>200 ms server-side time) | **10 / minute / session**             | 429 + advice to refine query                   |
| Composition write (POST/PUT)                    | **120 / minute / session**            | 429                                            |
| Read APIs (patient view, EHR fetch)             | **600 / minute / session**            | 429                                            |
| Audit-log export                                | **1 / hour / session**                | 429 + audit event                              |
| Emergency-access invocation                     | **3 / session, lifetime**             | Force logout + re-auth                         |
| `/api/csp-report` (anonymous)                   | **30 / minute / source IP**           | drop silently                                  |

The reason AQL queries get a stricter limit than ordinary reads: a malicious or buggy query can exhaust EHRbase. We rate-limit at the BFF rather than relying on EHRbase's own throttling, because Valkey latency is sub-millisecond and protects EHRbase from receiving the load at all.

### 5.10 Session timeouts

Per OWASP ASVS 5.0 Level 3 (the tier explicitly named for "healthcare platforms", banking, military, and critical infrastructure):

| Timeout                        | Value                                    | Rationale                                                                                                                                                                                                                                                    |
| ------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Idle timeout**               | **15 minutes**                           | Stricter than ASVS L3's 30 min — matches the common EU clinical-workstation convention (ISO 27799 guidance + most national hospital security policies). Clinical workstations are often left unattended; an idle session is the easiest exfiltration vector. |
| **Absolute (re-auth) timeout** | **12 hours**                             | Matches OWASP ASVS L3 v5.0.0 §3.3.2. Even an actively-used session forces re-authentication once per shift.                                                                                                                                                  |
| **Token refresh window**       | **5 minutes** before access-token expiry | App refreshes silently while the user is active.                                                                                                                                                                                                             |
| **Logout grace period**        | **0 seconds**                            | Server-side session deletion is immediate (§5.3 — we chose Valkey over iron-session specifically for this).                                                                                                                                                  |

Both timeouts are configurable per deployment via env vars (`SESSION_IDLE_TIMEOUT_SECONDS`, `SESSION_ABSOLUTE_TIMEOUT_SECONDS`), with the v1.0 defaults above as the floor. Hospital deployments can be stricter; they cannot be more lax.

### 5.11 Source maps in production

- **`build.sourcemap: 'hidden'`** in Vite config — source maps are generated but no `//# sourceMappingURL=` comment lands in the production bundle. The browser cannot fetch them.
- **Source maps uploaded as a build artifact** in the release pipeline (§20.6), accessible only to the security team for incident analysis.
- **No source-map files served from the production origin** — Caddy/nginx config has an explicit `deny` for `*.map` paths.

This balances "give attackers no debug help" with "give our incident response team something to work with when a real crash happens."

### 5.12 Supply-chain compromise — pinning, delayed installs, and the CVE-floor list

Two real-world events from the months immediately before this document was written define the operational posture for dependency consumption:

**CVE-2026-45321 — TanStack supply-chain compromise (May 11, 2026).** A malicious actor exfiltrated a GitHub Actions OIDC token from TanStack's CI runner (via a `pull_request_target` misconfiguration plus runner-memory extraction plus cache poisoning) and published tampered versions of **42 `@tanstack/*` packages** to npm. The malware was a credential-stealing worm: once installed on a victim's machine, it used the victim's own npm tokens to enumerate and republish packages they maintained, propagating the attack. **84 versions were ultimately deprecated.** The advice was to pin to known-good versions published before 2026-05-11 (or after the cleanup). We use TanStack heavily (Router, Query, Start) — this incident directly affects this project's supply chain. The `@tanstack/react-start@1.168.13` pinned in our stack table is post-cleanup and clean; that is why the version is named explicitly rather than left as `^1.168`.

**The pnpm 11 `minimumReleaseAge: 1440` default would have meaningfully reduced exposure.** pnpm 11 (released April 28, 2026) ships with this setting on by default — newly published versions are not installable until they have existed for at least 24 hours. The TanStack tampered versions were detected and pulled within hours of publication; a project using pnpm 11's default would never have been able to install them. This is the single biggest reason we chose pnpm 11.x for v1.0 rather than older pnpm or another package manager.

**Operational rules that follow from these events:**

1. **Never accept `^` or `~` on TanStack packages until the post-incident dust has fully settled.** Pin to exact versions in `package.json`. Re-evaluate at the v1.0 tag.
2. **`minimumReleaseAge: 1440`** stays on, project-wide. The pnpm default. Documented in `.npmrc`.
3. **`blockExoticSubdeps: true`** stays on, also a pnpm 11 default.
4. **CVE-floor for security-fixing patch versions** — when a known CVE is fixed in a specific patch version of a deeply-trusted dependency (database, identity provider, session store), the `package.json` / Dockerfile constraint is bumped to `>= that-version`, not left at the major. Currently enforced floors:
   - **Keycloak ≥ 26.6.2** — CVE-2026-37981 (Broken Access Control in Account Resources User Lookup allowing PII enumeration). Earlier 26.6.x is vulnerable.
   - **Valkey ≥ 9.1.0** — CVE-2026-23479 (use-after-free in unblock client flow), CVE-2026-25243 (invalid memory access in `RESTORE`), CVE-2026-23631 (use-after-free during full sync with yielding Lua/function execution). All three fixed in 9.1.0.
   - **Docker engine ≥ 29.0** — CVE-2026-32288 (DoS via maliciously crafted image with sparse tar archives) fixed in 29.x line; also note that 29.0 changes the default image store to containerd, which is the configuration this project's Dockerfile assumes.
5. **`pnpm audit signatures`** (new in pnpm 11.1) runs in CI on every install to verify ECDSA registry signatures. Documented in §20.3.
6. **The signed-release pipeline in §20.6** is the upstream version of the discipline expressed here — our project ships with the same level of supply-chain integrity that we wish upstream had ourselves.

---

## 6. UI Layer — shadcn/ui + React 19 (patient-centric clinical workspace)

This is a **patient-centric clinical workspace** modelled on HIX-style hospital EPDs (HIX / Epic / Cerner / OpenMRS), built on the openEHR open standard. **Multi-role from day one** — physician, nurse, admin, audit-reviewer, researcher each get a role-specific home screen (ADR-0017) with the same underlying React tree.

The shape of the workspace, the IA, and the per-surface mapping to openEHR are spelled out in [`docs/CLINICAL-UI.md`](CLINICAL-UI.md). §§6.1–6.17 below describe the engineering side of each surface (which shadcn primitives, which custom code, where the data flows). Read CLINICAL-UI.md first; the sub-sections here assume it.

### Component ownership

shadcn/ui components are **copied into the repo** via the CLI. We treat them as our own code — we can fix bugs, adjust styling, and audit them line by line. There is **no shadcn runtime dependency**.

### Strict constraint: official components only

> **Rule.** When a UI primitive is needed, the team **must** check the official shadcn/ui registry first. Custom UI primitives are forbidden when an official one exists. Custom code is reserved for openEHR-specific concerns: dynamic form field renderer, composition tree viewer, AQL editor wrapper, vitals charts.

### Setup (verified against current docs)

```bash
# 1. Scaffold (recommended path — TanStack CLI configures Tailwind + @/* alias)
pnpm dlx create-tsrouter-app@latest ehrbase-ui --template start --tailwind

# 2. shadcn init
cd ehrbase-ui
pnpm dlx shadcn@latest init

# 3. Add components we need
pnpm dlx shadcn@latest add \
  button card form input textarea select combobox checkbox radio-group switch \
  date-picker calendar slider label \
  table data-table tabs accordion badge avatar separator \
  alert alert-dialog dialog sheet drawer sonner progress skeleton tooltip popover \
  navigation-menu breadcrumb pagination sidebar command \
  chart
```

Tailwind v4 is what shadcn/ui currently recommends. Configuration is CSS-first (`@theme` directive in `src/styles.css`).

### React 19 features we use

- **`useActionState` / `useFormStatus`** — for _simple_ server-action-style forms (login, settings, single-button mutations).
- **`useOptimistic`** — for actions where instant feedback matters (e.g. acknowledging an alert).
- **`use()`** — to read promises in components when integrating with TanStack Query's `suspense` mode.

### React 19 vs react-hook-form — when to use which

| Form type                                           | Use                                                                                     |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Simple, mostly server-driven (login, single-field)  | React 19 Actions + `useActionState`                                                     |
| Complex, dynamic, lots of fields, conditional logic | **react-hook-form** (which is what shadcn `Form` wraps)                                 |
| **Dynamic openEHR forms (the heart of this UI)**    | **react-hook-form** — required for field arrays, async validation, controlled rendering |

The two are not in conflict; they serve different parts of the app. The openEHR form engine in §7 is built entirely on react-hook-form because that pattern handles cardinality and deep nesting cleanly.

### 6.x Print and PDF output

Clinical workflows produce paper. A printable patient summary, a printable composition view, and a printable `/me/access-log` (for patients exercising GDPR Art. 15) are all explicit v1.0 deliverables.

**Strategy: browser-side print, no server-side PDF library.**

- Every view that needs to be printable has a Tailwind `print:` variant block in its stylesheet — hiding nav, sidebar, dev artefacts; expanding collapsed sections; setting `page-break-inside: avoid` on each major card.
- A clear "Print" button in the page header triggers `window.print()`; users print-to-PDF using the OS dialog if they want a file.
- Print stylesheets are tested in CI via Playwright `page.emulateMedia({ media: 'print' })` + axe pass — confirming the printed version has no contrast or landmark regressions.

**Why not server-side PDF generation (Puppeteer / PDFKit / etc.)** — it adds a server-side Chromium dependency, a measurable attack surface (every CVE in headless Chrome becomes ours), and most of what server-side PDF generation gives you (consistent rendering, headers/footers, page numbers) `@page` CSS already provides in modern browsers. We can revisit post-v1.0 if a specific use case demands it (e.g., automated discharge summaries on a schedule). ADR-0020 records this.

### Clinical-UI surface catalogue (§§6.1–6.17)

These sub-sections describe the _engineering_ of each clinical surface — the shadcn primitives + custom code + data-flow. The clinical / functional contract (purpose, role, openEHR archetypes, audit fields, CDS hooks) lives in [`docs/CLINICAL-UI.md`](CLINICAL-UI.md); these §-numbers cross-reference its screen-catalogue entries.

#### 6.1 Workspace IA + patient routing — ADR-0015

Patient-bound surfaces all live under `/{locale}/_authed/patients/$patientId/<surface>`. The `$patientId` segment is the openEHR `ehr_id`. The `patients/$patientId/` layout route fetches the patient header banner once via the M7 demographic service + a summary AQL query and renders the child surface inside it. Shareable URLs + deep-linking preserve through OIDC redirects. Symmetric locale prefix per ADR-0014. Cross-cutting surfaces (`/inbox`, `/aql`, `/me`, `/admin/*`) sit outside the patient layout.

#### 6.2 Role-specific home — ADR-0017

`/_authed/home` resolves to the active role's home screen — physician / nurse / admin / audit-reviewer / researcher. Multi-role users hit `/_authed/role-picker` on first login. The choice is stored as a per-user preference in our app DB and switchable via the user menu. RBAC at the BFF still enforces actual permissions; the home choice only affects defaults.

#### 6.3 Patient header banner (M8) — `CLINICAL-UI.md` §7.1

A layout component (not a per-route fetch) that wraps every `patients/$patientId/*` screen. Reads from the M7 demographic service + EHR `ehr_status` + a single AQL query (`patient_summary_header` in `docs/aql-catalogue.md`). Critical allergies render in red via `Badge variant="destructive"`. Care-relationship check via `requireRole`; on miss, surfaces a `BreakGlassButton` (links to §5.6).

#### 6.4 Global patient search + recently-viewed (M8) — `CLINICAL-UI.md` §§7.2–7.3

Search hits the M7 demographic service (`/api/demographic/party?identifier_namespace=...&identifier_value=...`), then cross-checks an EHR exists in EHRbase for the matched PARTY. shadcn `Command` palette (cmdk) + `DataTable` for results. Recently-viewed is a per-user table in our app Postgres (not openEHR — that's UI state, not clinical data).

#### 6.5 Encounter / visit list (M8) — `CLINICAL-UI.md` §7.4

Reads via AQL over `EHR.compositions[]` joined to `DIRECTORY/FOLDER`. Each encounter is a FOLDER containing the compositions written during it. Virtualised `DataTable` (>50 rows uses `@tanstack/react-virtual`).

#### 6.6 Vitals flowsheet (M9) — `CLINICAL-UI.md` §7.5

Grid of vital-sign × time. Custom `VitalsFlowsheet` component (the "small custom code" carve-out from §6 rule). Recharts `LineChart` (ADR-0018) for trends. AQL queries `vitals_latest_*` + `vitals_trend_*` per archetype. Quick-entry drawer for nurse-led data entry. CDS rule `cds_005_critical_bp` fires at write time (ADR-0021).

#### 6.7 Lab results timeline (M9) — `CLINICAL-UI.md` §7.6

`DataTable` of recent results, abnormal-flag `Badge`, Recharts `LineChart` for trends. LOINC autocomplete via Snowstorm (ADR-0022). CDS rule `cds_003_renal_dose_adjust` cross-references active medications.

#### 6.8 Clinical notes (M10) — `CLINICAL-UI.md` §7.7

Custom `NoteEditor` (TipTap-based rich text + structured-field slots). SOAP layout via openEHR `SECTION`. Saved as `openEHR-EHR-COMPOSITION.encounter.v1` + `EVALUATION.clinical_synopsis.v1`. Autosave drafts encrypted in Valkey (24 h TTL). Signing writes the canonical composition + the dual-layer audit (ADR-0024).

#### 6.9 Problems + medications + allergies + immunisations (M11) — `CLINICAL-UI.md` §§7.8–7.11

Combined view under `/_authed/patients/$patientId/problems`. Each sub-area has its own `DataTable` + `Sheet` for add/edit. Severity `Badge` on allergies. Drug-allergy interaction fires via CDS rule `cds_001_drug_allergy_match` (ADR-0021) on prescribe or allergy-write. SNOMED CT autocomplete via Snowstorm.

#### 6.10 Orders / CPOE (M12) — `CLINICAL-UI.md` §7.12

`OrderSetPicker`, `DataTable` for active orders, per-order `Sheet`. Order sets via openEHR PROC `TASK_PLAN.order_set_id` (ADR-0019 + ADR-0025). CDS alerts surface inline (`Alert` variant by severity); critical alerts block submit until dismissed with documented justification.

#### 6.11 Care plan + tasks (M13) — `CLINICAL-UI.md` §7.13

Tree view of `WORK_PLAN` → `TASK_PLAN` → `PLAN_ITEM`. Checkbox completion writes `ACTION.care_plan` with `workflow_id` linking back to the PLAN_ITEM. Nurse home dashboard reads "active tasks for my ward" via AQL `care_plan_active_tasks`.

#### 6.12 AQL editor + result tables (M14) — `CLINICAL-UI.md` §7.14

CodeMirror 6 + custom AQL language grammar. Stored-query catalogue (`docs/aql-catalogue.md`) for power users to save + share. `DataTable` virtualised for large result sets. Audit logs the named query (or hash of ad-hoc query body), never the body in clear.

#### 6.13 Admin UI — users / roles / audit / CDS (M15) — `CLINICAL-UI.md` §§7.15–7.17

Admin user management proxies to Keycloak admin API via the BFF. Audit-review dashboard implements the sample-of-60 NEN-7513 quarterly review (§14.13). CDS rule authoring is a form-based UI (not raw GDL2 editing) over the GDL2-aligned internal format (ADR-0021).

#### 6.14 Discharge + referrals + document viewer (M16) — `CLINICAL-UI.md` §§7.18–7.20

Discharge-summary editor assembles from existing data (problems / meds / recent results) into `openEHR-EHR-COMPOSITION.discharge_summary.v1`. Referrals via `openEHR-EHR-COMPOSITION.referral.v0`. Document viewer = PDF.js for PDF + standard `<img>` for image attachments. DICOM studies list with external-PACS-viewer launch link (per ADR-0020). Print via Tailwind `print:` variants.

#### 6.15 Inbox / messaging (M17) — `CLINICAL-UI.md` §7.21

Non-openEHR internal Postgres tables (messages are workflow, not clinical data). `DataTable` for thread list, `Sheet` per thread. CDS-driven alerts (e.g. new critical lab result) drop into this same inbox.

#### 6.16 Article 15 access log (M3 / M4) — `CLINICAL-UI.md` §7.22

Patient-facing view at `/_authed/me/access-log`. Reads from the audit DB (not EHRbase). PDF download via browser print. The scaffold landed in M3; M4 wires the audit feed. Forms the v1.0 patient-facing minimum; full patient portal is v1.x.

#### 6.17 Print / PDF (M16 + cross-cutting) — ADR-0020

Tailwind `print:` variants on every printable surface. `page-break-before` / `page-break-inside: avoid` placed deliberately. Print-only header with `{patient name | DOB | MRN | document title | print date}`. Server-side PDF deferred to v1.x.

---

## 7. Dynamic Forms from openEHR Templates

This is the most novel part of the application. EHRbase returns a JSON "web template" describing the form structure of any operational template; the UI compiles this into a working react-hook-form at runtime.

### Pipeline

```
Web Template JSON  ──► Zod schema generator  ──► react-hook-form
                                                       │
                                                       ▼
                                          shadcn Field renderer (recursive)
                                                       │
                                                       ▼
                                          FLAT format converter
                                                       │
                                                       ▼
                                          POST /ehr/{id}/composition?format=FLAT
                                                       │
                                                       ▼
                                          logAudit({ action: 'CREATE' })
```

### `rmType` → shadcn component mapping

| openEHR type               | shadcn component                         | Notes                                             |
| -------------------------- | ---------------------------------------- | ------------------------------------------------- |
| `DV_TEXT`                  | `Input` / `Textarea`                     | textarea if `maxLength > 80`                      |
| `DV_CODED_TEXT`            | `Select` (≤7 options) / `Combobox`       | terminology binding metadata stored in form state |
| `DV_QUANTITY`              | `Input type=number` + `Select` for units | composite control                                 |
| `DV_COUNT`                 | `Input type=number`                      | integer step                                      |
| `DV_BOOLEAN`               | `Switch`                                 | label inline                                      |
| `DV_DATE_TIME` / `DV_DATE` | shadcn `DatePicker`                      | + time `Input` for full datetime                  |
| `DV_ORDINAL`               | `RadioGroup`                             | each option = ordinal symbol + value              |
| `DV_PROPORTION`            | two `Input`s + slash                     | composite                                         |
| `DV_MULTIMEDIA`            | custom file uploader                     | wraps shadcn `Input type=file`                    |

### Cardinality (repeating elements)

A node with `max > 1` (or `max === -1` for unbounded) renders inside a `useFieldArray`. The renderer recursively descends into each item with an indexed path; an "Add" button appends, a per-item trash button removes (subject to `min` constraint).

### Validation

Zod schema is generated from the web template before the form mounts. Constraints on `inputs[]` (range, pattern, list, length) become Zod refinements. The form uses `zodResolver(schema)`.

### FLAT conversion

After validation, form values are walked into FLAT key format and POSTed to EHRbase with the `openEHR-TEMPLATE_ID` query parameter. The server function logs an audit event on success or failure.

(For brevity full code listings of `FieldRenderer`, `ArrayFieldRenderer`, the schema generator, and the FLAT converter are kept in the codebase as documented modules. See `docs/adr/0007-openehr-form-renderer.md`.)

### 7.x File uploads (`DV_MULTIMEDIA`)

The `DV_MULTIMEDIA` rmType is the only path by which non-textual PHI enters the system — scanned referrals, ECG screenshots, wound photos, sometimes DICOM. Treating this casually is exactly the failure mode that gets cited in healthcare breach reports.

**Constraints enforced server-side** (the client also enforces them, but only the server gates):

- **Max size**: 50 MB per file (configurable per deployment; hospitals sometimes raise this for DICOM).
- **Allowed MIME types** (`application/pdf`, `image/jpeg`, `image/png`, `image/webp`, `application/dicom`, `text/plain`). The list is short on purpose — every new type is a new attack surface.
- **MIME sniffing on the server**, not trusting the client `Content-Type`. The npm `file-type` package reads the binary signature.
- **EXIF metadata stripped** from images via `exiftool` before persistence. GPS coordinates in image EXIF are a textbook PHI leak.

**Virus scanning via ClamAV.** Every uploaded file is scanned before it reaches EHRbase. Pattern:

1. Upload arrives at server function as a multipart stream.
2. Stream is teed to a temp file under `/tmp/uploads/<uuid>` (memfd on Linux for in-RAM where possible).
3. Server function calls `clamdscan` via Unix socket to the **ClamAV sidecar container** (separate service in docker-compose, runs `clamav/clamav:1.4-x` with `freshclam` keeping signatures current).
4. On clean result → upload is forwarded to EHRbase as a CONTRIBUTION with attachment, audit event written.
5. On infected → file is deleted from temp storage, an `UPLOAD_INFECTED` audit event is written (with virus name from ClamAV, uploader ID, filename), and the user gets a generic "File rejected by security scanning" error. Do not name the virus to the user.

ClamAV is GPLv2; running it as a sidecar (not bundled in our process) keeps the GPL well-fence intact for our Apache 2.0 codebase.

**Storage**: forward to EHRbase's native blob storage (EHRbase 2.31+ supports inline attachments in CONTRIBUTION). No separate object store. Patient ID → composition ID → attachment URI is the storage hierarchy; standard openEHR semantics.

### 7.x Concurrent edits — optimistic locking via ETag

Two clinicians editing the same composition simultaneously is rare but happens (ward handover, multi-disciplinary review). EHRbase already implements optimistic concurrency via the standard openEHR `If-Match` ETag pattern on composition PUT — we just plumb it through.

Flow:

1. When the form mounts, the server function returns the composition + its current `version_uid` (ETag).
2. On save, the BFF sends `If-Match: <version_uid>` to EHRbase.
3. EHRbase returns **412 Precondition Failed** if another save landed in between.
4. The UI catches the 412, re-fetches the latest version, and shows a **side-by-side diff modal**: "{other-clinician} updated this composition at {timestamp}. Review their changes:" with three actions — "Discard my changes (use theirs)", "Overwrite their changes (use mine — requires justification)", "Merge manually (back to the form with both values visible)".
5. The "Overwrite" path requires free-text justification (≥ 20 chars), and the override fact is captured in the audit log as a special `CONCURRENT_OVERWRITE` event.

Default UX: never silently discard either set of changes. Surface the conflict to a human.

### 7.x Form autosave — Valkey-backed drafts

Long compositions (admission histories, multi-section assessments) take 15–30 minutes to enter. A closed tab or session timeout that wipes that work is a clinical failure.

Pattern:

- The form's `react-hook-form` state is serialized every 10 seconds (debounced) and POSTed to `/api/drafts/<draft-id>` as a server function.
- Drafts live in Valkey, keyed by `draft:{userId}:{templateId}:{patientId}`, with **24-hour TTL** and **AES-256-GCM encryption-at-rest** (Valkey supports this via its `tls-encrypt-data` config; in our deployment we additionally encrypt the value with `AUDIT_PSEUDONYM_SECRET`-derived key before storing).
- On form mount, the client checks for an existing draft and offers "You have an unsaved draft from {timestamp}. Resume or discard?" — user choice, never auto-load.
- On successful composition commit, the draft is deleted immediately.

**Why server-side draft storage instead of `localStorage`** — `localStorage` lands PHI on the browser disk, never expires unless the user clears it, survives logout, and is readable by any XSS that gets past the CSP. Storing drafts server-side in encrypted Valkey with TTL keeps PHI lifecycle aligned with the session lifecycle.

The draft endpoint emits a `DRAFT_SAVED` audit event with no PHI body (just timestamp + draft ID + composition pointer), so we can prove the draft existed in case of a later dispute about who wrote what.

---

## 8. AQL Editor & Data Tables

### AQL editor

shadcn/ui has no code editor primitive, so we use **`@uiw/react-codemirror`** wrapping CodeMirror 6. Initial language extension is `@codemirror/lang-sql` — AQL syntax is close enough that SQL highlighting is useful. A custom Lezer grammar for proper AQL parsing is an optional future enhancement, not a v1.0 requirement.

We add an `openEHR` schema to the autocomplete source so users get suggestions for `EHR`, `COMPOSITION`, `OBSERVATION`, etc.

### Result tables

All data tables — the AQL result grid included — go through the shared **`DataTable`** primitive at `apps/web/src/components/ui/data-table.tsx`, which wraps `@tanstack/react-table` (built following shadcn's `data-table` guide on top of the vendored `table.tsx` primitive). This is the mandatory entry point for tabular data; hand-rolled `<Table>`-markup tables are not allowed (**ADR-0038**, CLAUDE.md rule 6a). AQL responses are dynamic-shape; we build `ColumnDef`s at runtime from the result's column metadata, with cell formatters for openEHR composite types (`{magnitude, units}` → `"120 mm[Hg]"`).

For large result sets (>500 rows), pass `virtualize` — `DataTable` then renders the body via `@tanstack/react-virtual`, keeping native `<table>/<tr>/<td>` semantics (spacer rows, no display hacks) so the accessibility tree retains its table roles. Sorting, an optional global filter, and client-side pagination come from the primitive's built-ins. Sanctioned exceptions (computed diffs / openEHR-specific grids, e.g. `conflict-dialog.tsx`, the vitals flowsheet) are listed in ADR-0038.

### Privacy note on AQL

AQL queries can contain PHI in `WHERE` clauses. The full query text is logged (§14) but the audit log store is encrypted at rest. See §14.3.

---

## 9. State Management

We deliberately ship **no general-purpose state library**. The stack already has the right tool for each job; adding one more is a dependency a hospital security team will ask about, for no gain.

| Kind of state                                                          | Where it lives                                                        | Why                                                                     |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Server data (EHRs, compositions, query results, templates)             | **TanStack Query**                                                    | What it's built for: caching, refetch, invalidation, retries            |
| URL-driven UI state (active patient, current AQL, pagination, filters) | **TanStack Router search params**                                     | Shareable URLs, browser back/forward, deep-linking; validated with Zod  |
| Form state                                                             | **react-hook-form** (via shadcn `Form`)                               | Performance, field arrays, async validation                             |
| **Theme** (light/dark/system)                                          | Small `ThemeProvider` writing to `localStorage` + a class on `<html>` | shadcn's official pattern; no library                                   |
| **Sidebar collapsed/expanded**                                         | Cookie read on the server during SSR                                  | shadcn `Sidebar` component documents this; avoids flash-of-wrong-layout |
| Component-local UI (open/closed, hover, input value)                   | `useState`                                                            | Right scope, no over-engineering                                        |

### Theme provider — the shadcn pattern

```ts
// src/components/theme/theme-provider.tsx
import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light' | 'system'
type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeProviderState | undefined>(undefined)

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'ehrbase-ui-theme',
}: {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}) {
  const [theme, setThemeState] = useState<Theme>(
    () => (typeof localStorage !== 'undefined'
      ? (localStorage.getItem(storageKey) as Theme | null) ?? defaultTheme
      : defaultTheme),
  )

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    const resolved =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        : theme
    root.classList.add(resolved)
  }, [theme])

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme: (t) => {
          localStorage.setItem(storageKey, t)
          setThemeState(t)
        },
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
```

To **prevent the flash of wrong theme** on first paint, an inline script in the SSR document head reads `localStorage` and applies the class **before** React hydrates. This is the standard approach (`next-themes`, shadcn docs).

### Sidebar state — server-rendered via cookie

shadcn's `Sidebar` component reads a `sidebar_state` cookie. In our `__root.tsx` loader we read that cookie server-side and pass `defaultOpen` to the provider, so the initial HTML has the correct layout — no layout shift after hydration.

```ts
// src/routes/__root.tsx (excerpt)
import { getCookie } from '@tanstack/react-start/server'
import { SidebarProvider } from '@/components/ui/sidebar'

export const Route = createRootRouteWithContext()({
  beforeLoad: () => ({
    sidebarOpen: getCookie('sidebar_state') !== 'false',
  }),
  component: RootLayout,
})

function RootLayout() {
  const { sidebarOpen } = Route.useRouteContext()
  return (
    <ThemeProvider>
      <SidebarProvider defaultOpen={sidebarOpen}>
        <Outlet />
      </SidebarProvider>
    </ThemeProvider>
  )
}
```

### Why not Zustand / Jotai / Redux

We considered Zustand (~1 KB, simple API, `persist` middleware). For the three small bits of UI state we have, it's overkill: theme has a battle-tested context pattern, sidebar state is best handled by the cookie pattern shadcn already documents, and everything else either lives on the server (TanStack Query) or in the URL (TanStack Router). Adding a state library would be a dependency we don't need. If a future feature genuinely requires cross-component non-server, non-URL state, we'll revisit with an ADR.

---

## 10. Error Handling Strategy

Clinical software has specific error rules. **PHI must never leak through error messages**, and certain not-found vs forbidden distinctions are themselves PHI.

### Rules

1. **Never display raw exception messages** to end users.
2. **Never include patient identifiers in error toasts.** "Patient could not be loaded" — not "Patient 1234567 not found".
3. **Conflate 404 and 403** when the existence of a record is itself sensitive. The server returns 404 in both cases; the audit log records the actual outcome.
4. **Always log full error context server-side** (correlation ID, stack, user, request) — application log, not the audit log.
5. **Show user-facing error with correlation ID only.** Support staff trace the correlation ID through Loki.
6. **Distinguish recoverable from non-recoverable** in the UI: validation errors live next to fields; system errors get a global `Alert`.

### Implementation hooks

- TanStack Query global `onError` → posts to `/api/log/client-error` (correlation ID, sanitized message), shows `toast`.
- TanStack Router `errorComponent` at root → catches loader errors, renders a generic error page with correlation ID.
- Server functions throw `Response` objects with structured `{ code, correlationId }` JSON bodies; client maps `code` → translated UI string.
- React error boundaries wrap each major feature area (patient list, composition form, AQL).

---

## 11. Internationalization (i18n)

**v1 ships English-only**, but the i18n architecture is in place from day one so adding any further EU language (Dutch, German, French, Spanish, Italian, Polish, …) later is mechanical, not architectural. The URL scheme is **symmetric** — every locale gets its own `/{locale}/...` prefix, including English — so no locale is privileged and switching deployments to a different primary language is configuration, not a redesign.

### 11.1 Library — Paraglide JS

We use **Paraglide JS** (`@inlang/paraglide-js`, MIT-licensed). This is the i18n library that **TanStack itself recommends for both TanStack Router and TanStack Start** — Paraglide is described in the TanStack docs as the recommended pairing, and the Paraglide team note their integration is "Part of TanStack's CI pipeline." Two officially-maintained examples live in the TanStack monorepo: `examples/react/i18n-paraglide` (client-only) and `examples/react/start-i18n-paraglide` (server-side, which is the one we follow).

Three reasons it's a good fit for a clinical app, not just for TanStack alignment:

1. **Compile-time tree-shaking → smaller bundles.** Paraglide is a _compiler_, not a runtime. The CLI reads message files (JSON) and emits typed message functions; your bundler then tree-shakes any message not actually imported. The team reports up to **70% smaller i18n bundle size** vs runtime libraries like `react-i18next` or `react-intl` (47 KB vs 205 KB in their benchmark). For a clinical workstation app where every kilobyte over WAN matters, this is real.
2. **Fully type-safe.** Calling `m.patient_record_saved()` is a typed function call — a typo becomes a TypeScript compile error, parameters are checked at compile time, and IDE autocomplete works out of the box. Compared to `t('patient.record.saved')` where typos surface as missing translations at runtime, this is qualitatively better for a domain where missing labels can confuse a clinician under time pressure.
3. **Production-grade adopters.** Used in production by Disney, Bose, Kraft Heinz, ETH Zurich, Brave, Michelin — meaning the corner cases of plurals, RTL, formatting, and large message catalogues are battle-tested, not theoretical.

### 11.2 Setup

Initialization is a single CLI command that scaffolds project structure, Vite plugin, and message files:

```sh
npx @inlang/paraglide-js@latest init
```

The Vite plugin (added in `vite.config.ts`) compiles message files on dev/build:

```ts
// vite.config.ts (excerpt)
import { defineConfig } from 'vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'

export default defineConfig({
  plugins: [
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './app/paraglide',
    }),
    // ...other plugins (TanStack Start, etc.)
  ],
})
```

### 11.3 Server-side rendering integration

Because we run TanStack Start with `ssr: 'data-only'` (§4), server-rendered content must already be in the right locale before it reaches the browser. Paraglide ships a server middleware that does this for us:

```ts
// server entry (TanStack Start)
import { paraglideMiddleware } from './paraglide/server'

export default {
  fetch(req: Request) {
    return paraglideMiddleware(req, () => handler.fetch(req))
  },
}
```

`paraglideMiddleware` reads the locale from the request (cookie, `Accept-Language` header, or URL prefix depending on strategy) and makes it available to `getLocale()` inside server functions and route loaders. No manual `Accept-Language` forwarding is needed.

### 11.4 Routing strategy — URL prefixes via TanStack Router rewrite

We use **symmetric URL-prefixed locales** (`/en/patients`, `/nl/patients`, `/de/patients`, …) rather than cookie-only routing or asymmetric "base locale unprefixed" setups. Reasons:

- Shareable URLs preserve the locale (a clinician sharing a link to a colleague keeps the original locale)
- Every locale is equal-class — no "default-special" semantics that would make later promoting another language to primary a breaking URL change
- Search-engine indexing per locale works correctly (relevant for our public marketing routes only — clinical routes are behind auth)
- Audit logs and access-log URLs (`/{locale}/me/access-log`) carry locale context naturally

The integration uses TanStack Router's `rewrite` option with Paraglide's `localizeUrl`/`deLocalizeUrl` helpers:

```ts
// app/router.tsx
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { deLocalizeUrl, localizeUrl } from './paraglide/runtime'

export const router = createRouter({
  routeTree,
  rewrite: {
    input: ({ url }) => deLocalizeUrl(url), // strip /{locale} prefix before route matching
    output: ({ url }) => localizeUrl(url), // add /{locale} prefix when generating Links
  },
})
```

Route definitions use TanStack's optional path parameter syntax (`/{-$locale}/path`) where needed; the layout route validates the locale code against the configured allow-list.

### 11.5 Conventions

- **Every user-visible string** goes through a Paraglide message function — `m.patient_records()` rather than `"Patient records"`. No hard-coded strings in JSX, even in v1.
- **Message file format** is the inlang JSON format (one file per locale: `messages/en.json`, `messages/nl.json`):
  ```json
  {
    "$schema": "https://inlang.com/schema/inlang-message-format",
    "patient_records": "Patient records",
    "patients_in_view": "{count, plural, one {# patient} other {# patients}}"
  }
  ```
- **Pluralization** uses the built-in `plural` formatter (`Intl.PluralRules` under the hood) — handles the simple Germanic / Romance plural cases (English, Dutch, German, French, Spanish, Italian) and locales with more complex plural rules (Polish, Russian, Arabic) without extra config.
- **Number/date formatting** uses the built-in `number` and `datetime` formatters (`Intl.NumberFormat`, `Intl.DateTimeFormat`) keyed off the active locale. We do not roll our own.
- **Namespacing by feature** is by message-key convention (e.g., `auth_login_button`, `patients_list_title`, `aql_query_run`) — Paraglide doesn't have separate namespace files, but the key prefix gives the same organization with one less indirection.
- **VS Code integration** via the inlang **Sherlock** extension shows inline translation previews and flags missing keys at edit time.

### 11.6 What's needed to add a new locale

The recipe is identical for any EU language — Dutch, German, French, Spanish, Italian, Polish, Portuguese, and so on:

1. Add `messages/<locale>.json` with translations of every key in `messages/en.json` (e.g. `messages/nl.json`, `messages/de.json`).
2. Add the locale code to the `locales` array in `project.inlang/settings.json` (e.g. `"locales": ["en", "nl"]`).
3. Add the locale's two URL patterns to the `urlPatterns` declarations in **both** `vite.config.ts` and `scripts/paraglide-compile.mjs` — these must stay in lockstep (Paraglide's CLI cannot pass urlPatterns, so the standalone compile uses the official programmatic SDK; both files have the patterns inline per the Paraglide docs). The two-line addition per locale:

   ```ts
   { pattern: '/',              localized: [['en', '/en'],              ['nl', '/nl']] },
   { pattern: '/:path(.*)?',    localized: [['en', '/en/:path(.*)?'],   ['nl', '/nl/:path(.*)?']] },
   ```

4. Run `pnpm paraglide:compile` (or `pnpm dev`) — the Paraglide compiler regenerates typed message functions; missing keys are TypeScript errors, surfaced immediately.
5. Add the locale to the language switcher in the user menu — it calls `setLocale('<locale>')` which writes a cookie and navigates to the localized URL.

No code changes outside translation files and these three config locations. The CI lint gate (next section) ensures we can't ship a release with missing translations.

### 11.7 CI safety net

A CI step runs `pnpm paraglide-js compile --strict` which fails the build if:

- A message key exists in `en.json` but is missing from any registered locale (catches incomplete translations of any added locale before merge).
- A `m.<key>()` call in source references a key that doesn't exist in any locale file (this is also a TypeScript error, but the explicit CLI check catches generated code paths the type checker might miss).

There's no `eslint-plugin-i18next` equivalent for Paraglide because the TypeScript compiler catches the same class of errors at a stronger guarantee — calling a non-existent message is a type error, not a runtime missing-key warning.

### 11.8 Time zones

Clinical timestamps are not negotiable. Medication-administration timing, vital-sign sequences, lab-result ordering — these are evidentiary. We use a single, simple policy:

- **All timestamps stored in UTC.** EHRbase already returns ISO 8601 with `+00:00` offsets; Postgres columns are `TIMESTAMPTZ`. The BFF never strips or transforms the offset on the way through.
- **Display in the user's resolved time zone**, derived from the Keycloak user profile (a `zoneinfo` claim is standard OIDC) or, if absent, from the browser's `Intl.DateTimeFormat().resolvedOptions().timeZone`. Never from the server's local time.
- **Clinically-significant timestamps display the time-zone abbreviation** next to the time itself: `09:14 CEST` not just `09:14`. This is the IHE PCD recommendation for cross-time-zone clinical contexts; it removes the "wait, was that local or UTC?" ambiguity.
- **Audit-log timestamps display UTC explicitly**, with a tooltip showing the local-time equivalent. Audit reviewers comparing logs across sites need an unambiguous timeline; the local-time conversion is for human readability only.

The Paraglide `datetime` formatter wraps `Intl.DateTimeFormat`, which already handles all of this when given the time zone explicitly. Code-side: a thin `<ClinicalTimestamp>` component takes a UTC ISO string and renders both the localized time and the TZ label.

---

## 12. Accessibility (WCAG 2.2 AA + EAA + EN 301 549)

### 12.1 Legal grounding — this is binding law, not a quality nice-to-have

The **European Accessibility Act** (Directive EU 2019/882) has been **enforceable across all 27 EU member states since 28 June 2025**. The harmonized technical standard is **EN 301 549 v3.2.1**, which currently incorporates **WCAG 2.1 Level AA** as the legal baseline.

**We target WCAG 2.2 Level AA**, not 2.1 AA. Three reasons:

1. **2.2 is a strict superset of 2.1.** All WCAG 2.1 success criteria carry forward unchanged; WCAG 2.2 adds 9 new criteria and deprecates one (4.1.1 Parsing, no longer relevant). Building to 2.2 automatically satisfies 2.1.
2. **EN 301 549 will incorporate WCAG 2.2 in its next revision** — the EU consultation has been underway since 2024 and is widely expected to land. Anything built only to 2.1 today will need a remediation project the day that revision is published. We avoid that retrofit by targeting 2.2 now.
3. **The new 2.2 criteria are clinically relevant.** Target size (SC 2.5.8) helps clinicians using tablets at the bedside; focus-not-obscured (SC 2.4.11) matters when our sticky headers cover form fields; accessible authentication (SC 3.3.8) means we can't rely on memory-based puzzles to log in; redundant entry (SC 3.3.7) means a clinician entering patient details doesn't have to re-type them in a related form. These directly help users who spend 8+ hours/day in this UI.

Penalties under EAA vary by member state but are real: Germany up to **€100,000 per violation**, France €5,000–€250,000 plus daily penalties for ongoing non-compliance. Authorities can order products removed from market or services suspended.

For a clinical app deployed in NL, accessibility is **not optional** — it is a legal release gate, alongside GDPR.

The microenterprise exemption (under 10 employees AND under €2M turnover) **does not protect hospital deployments** — the operator of the deployed system is the relevant economic operator, not us as upstream maintainers.

### 12.1a What WCAG 2.2 adds on top of 2.1 — items relevant to us

| SC                                            | Level | What it requires                                                                                                                                                                | How we satisfy it                                                                                                                                                                         |
| --------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **2.4.11 Focus Not Obscured (Minimum)**       | AA    | When a UI element receives keyboard focus, it must not be entirely hidden by author-created content (sticky headers, dialogs, etc.).                                            | Sticky header/footer use `scroll-margin-top` so focused inputs scroll into view. Verified at runtime by axe.                                                                              |
| **2.5.7 Dragging Movements**                  | AA    | Any function operated by dragging must have a single-pointer alternative (click/tap).                                                                                           | The dashboard reordering UI exposes "Move up / Move down" buttons next to every draggable card.                                                                                           |
| **2.5.8 Target Size (Minimum)**               | AA    | Pointer targets at least 24×24 CSS pixels (with exceptions).                                                                                                                    | Our base button is 36px; small/icon variants ≥ 24px enforced via Tailwind token. axe `target-size` rule **explicitly enabled** (it's opt-in in axe-core).                                 |
| **3.2.6 Consistent Help**                     | A     | Help mechanisms (contact, chat, FAQ) appear in the same relative order on every page.                                                                                           | A single `<SiteFooter>` component renders the help links in the same order on every authed route.                                                                                         |
| **3.3.7 Redundant Entry**                     | A     | Information previously entered by the user (in the same session, same process) must be auto-populated or available to select — except where re-entry is essential for security. | Multi-step composition forms persist prior-step values in URL state + react-hook-form context; the patient-ID and encounter-ID are auto-filled across related forms in the same workflow. |
| **3.3.8 Accessible Authentication (Minimum)** | AA    | No cognitive function test (memorizing puzzles, transcribing, performing calculations) required to log in. Password managers, copy-paste, and biometrics must work.             | Keycloak login form: passwords paste-enabled (no `paste="off"`), no CAPTCHA puzzles, WebAuthn / passkeys supported.                                                                       |

(WCAG 2.2's other new criteria — 2.4.12, 2.4.13, 3.3.9 — are at Level AAA and are aspirational, not required.)

### 12.2 Defense in depth — three layers

No single tool catches everything. Industry consensus: automated tools catch ~30–40% of accessibility issues; the rest needs manual testing with assistive technology. We do all three layers:

| Layer                                   | When it runs              | What it catches                                                                                        |
| --------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------ |
| **ESLint (`eslint-plugin-jsx-a11y-x`)** | Every save / every commit | Static issues in JSX: missing `alt`, invalid ARIA, `onClick` on `<div>`, etc. ~30 rule families.       |
| **`axe-core` via Vitest + Playwright**  | Every PR / CI             | Rendered-DOM issues: color contrast, focus order, landmark roles, ARIA relationships in the live page. |
| **Manual assistive-technology pass**    | Before release tagging    | The 60% automation misses: actual screen reader experience, keyboard journeys, cognitive load.         |

### 12.3 ESLint plugin

We add **`eslint-plugin-jsx-a11y-x`** (the actively-maintained fork) under **ESLint v10**. This is a deliberate package choice — see the "ecosystem compatibility" note below for why.

```js
// eslint.config.js — flat config, ESLint v10
import { defineConfig, includeIgnoreFile } from 'eslint/config'
import { fileURLToPath } from 'node:url'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y-x'
import reactX from '@eslint-react/eslint-plugin'

const gitignorePath = fileURLToPath(new URL('.gitignore', import.meta.url))

export default defineConfig([
  // Honor .gitignore (v10.4 built-in helper, no @eslint/compat needed)
  includeIgnoreFile([gitignorePath]),

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        // typescript-eslint v8 project-service is stable; auto-detects tsconfig.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@eslint-react': reactX,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      // Start from strict accessibility preset; only override deliberately.
      ...jsxA11y.configs.strict.rules,

      // React Hooks rules
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',

      // Hard errors — these would directly fail an EN 301 549 / WCAG 2.2 audit.
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-role': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',
      'jsx-a11y/label-has-associated-control': 'error',
      'jsx-a11y/no-redundant-roles': 'error',
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/no-static-element-interactions': 'error',
      'jsx-a11y/no-noninteractive-element-interactions': 'error',
      'jsx-a11y/heading-has-content': 'error',
      'jsx-a11y/iframe-has-title': 'error',
      'jsx-a11y/img-redundant-alt': 'error',
      'jsx-a11y/no-autofocus': 'error',
      'jsx-a11y/no-distracting-elements': 'error',
      'jsx-a11y/scope': 'error',
      'jsx-a11y/tabindex-no-positive': 'error',
      'jsx-a11y/lang': 'error',
      'jsx-a11y/html-has-lang': 'error',
      'jsx-a11y/no-access-key': 'error',
      'jsx-a11y/media-has-caption': 'error',
      'jsx-a11y/no-aria-hidden-on-focusable': 'error',
      'jsx-a11y/prefer-tag-over-role': 'error',
    },
    settings: {
      'jsx-a11y': {
        // Treat our shadcn primitives as their underlying semantic elements
        // so the plugin doesn't false-positive on <Button> vs <button>.
        polymorphicPropName: 'as',
        components: {
          Button: 'button',
          Link: 'a',
          Image: 'img',
          Input: 'input',
          Label: 'label',
          Textarea: 'textarea',
        },
      },
    },
  },
])
```

#### Why this package selection (ESLint 10 ecosystem reality, May 2026)

| Concern                | What we use                                | Why not the obvious default                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **ESLint core**        | `eslint@^10`                               | ESLint v9 hits EOL on **2026-08-06** — staying on v9 means an unsupported linter in ~10 weeks. v10 is current (v10.4.0 as of May 15, 2026).                                                                                                                                                                                                                                                                                                            |
| **TypeScript support** | `typescript-eslint@^8`                     | Officially supports `eslint ^8.57 \|\| ^9 \|\| ^10`. The `recommendedTypeChecked` preset + the stable `projectService` parser option is what v8 standardizes on.                                                                                                                                                                                                                                                                                       |
| **JSX accessibility**  | `eslint-plugin-jsx-a11y-x` (fork)          | The canonical `eslint-plugin-jsx-a11y` was last published Oct 2024 and has not been updated for ESLint v10. The `-x` fork is actively maintained, supports ESLint v9 and v10 in its `peerDependencies`, and is otherwise rule-compatible.                                                                                                                                                                                                              |
| **React rules**        | `@eslint-react/eslint-plugin@^2.13`        | `eslint-plugin-react@7.37.5` is **broken on ESLint v10** — it calls the removed `context.getFilename()` API and throws `TypeError: contextOrFilename.getFilename is not a function` on first lint. PR #3979 (the fix) has been blocked since February 2026. `@eslint-react` is a modern rewrite of the same rule set, supports ESLint 8/9/10, and is being adopted as a drop-in by other major projects (e.g., FluidFramework switched in early 2026). |
| **React Hooks**        | `eslint-plugin-react-hooks@^7`             | The 7.x line **added native ESLint v10 support** (Facebook PR #35720). Earlier majors had a too-strict `peerDependencies` range that blocks v10 installation.                                                                                                                                                                                                                                                                                          |
| **Ignore files**       | `includeIgnoreFile()` from `eslint/config` | New in ESLint **v10.4.0** — no longer need `@eslint/compat` for this.                                                                                                                                                                                                                                                                                                                                                                                  |

We re-evaluate every six months: if canonical `eslint-plugin-jsx-a11y` ships a v10-compatible release, or if `eslint-plugin-react` PR #3979 lands, we may switch back to the canonical packages.

#### `eslint:recommended` changes in v10 we explicitly accept

ESLint v10's `eslint:recommended` preset adds three rules that were not in v9:

- **`no-unassigned-vars`** — flags variables declared but never assigned. Catches dead code.
- **`no-useless-assignment`** — flags assignments that are immediately overwritten. Catches refactor leftovers.
- **`preserve-caught-error`** — when re-throwing inside `catch`, requires the original error be referenced (via `{ cause: err }` or otherwise). Important for our error handling (§10) so we never silently swallow upstream stack traces from EHRbase or Keycloak.

All three are useful for a clinical app where dead code and lost stack traces are the small mistakes that bite during an incident. We accept them as-is.

**No lint errors allowed in CI.** The `quality` job in `ci.yml` (§20.3) runs `pnpm eslint . --max-warnings=0`. That gate enforces this whole section without any extra wiring.

### 12.4 Runtime testing — `axe-core` configured for WCAG 2.2 AA + EN 301 549

`axe-core` lets us pin the rule set to exactly what we target. We pass the full tag chain (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`) plus the `EN-301-549` tag so a passing test is direct evidence we meet the legal target.

**Important: `target-size` (WCAG 2.2 SC 2.5.8) is opt-in in axe-core.** Deque ships it disabled by default "until WCAG 2.2 is more widely adopted and required." We explicitly enable it via the `rules` override below, because we're treating 2.2 as our baseline.

**Vitest unit tests** — every visual component gets an axe pass:

```ts
// src/components/ui/__tests__/button.a11y.test.tsx
import { render } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'vitest-axe'
import { Button } from '@/components/ui/button'

expect.extend(toHaveNoViolations)

const axeConfig = {
  runOnly: {
    type: 'tag' as const,
    values: [
      'wcag2a', 'wcag2aa',
      'wcag21a', 'wcag21aa',
      'wcag22aa',
      'best-practice',
      'EN-301-549',
    ],
  },
  rules: {
    // WCAG 2.2 SC 2.5.8 — opt-in in axe-core; we want it on.
    'target-size': { enabled: true },
  },
}

test('Button has no axe violations', async () => {
  const { container } = render(<Button>Save patient record</Button>)
  const results = await axe(container, axeConfig)
  expect(results).toHaveNoViolations()
})
```

**Playwright E2E** — every critical clinical flow checks the rendered, post-hydration page:

```ts
// e2e/accessibility.spec.ts
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('Patient detail page meets WCAG 2.2 AA + EN 301 549', async ({ page }) => {
  await page.goto('/patients/test-fixture-001')
  await page.waitForLoadState('networkidle')

  const results = await new AxeBuilder({ page })
    .withTags([
      'wcag2a',
      'wcag2aa',
      'wcag21a',
      'wcag21aa',
      'wcag22aa',
      'EN-301-549',
    ])
    .options({
      rules: { 'target-size': { enabled: true } },
    })
    .analyze()

  expect(results.violations).toEqual([])
})
```

Critical flows covered: login, patient list, patient detail, composition form, AQL editor, access-log view.

A shared `e2e/axe-config.ts` (and a matching `src/test/axe-config.ts`) export the rule-set + opt-ins so every test file uses the same configuration. Drift between unit and E2E configs is a real risk — single source of truth prevents it.

### 12.5 Design-time foundations we already get for free

- **shadcn/ui builds on Radix UI** — keyboard navigation, focus management, ARIA roles, screen reader support are correct by default. This is a big chunk of WCAG 2.1 + 2.2 we don't have to implement.
- **Tailwind v4.3** with `prefers-reduced-motion` honored in our base theme.
- **Visible focus rings** mandatory — never `outline: none` without a replacement ring. (WCAG 2.2 SC 2.4.11 Focus Not Obscured also requires the focused element be at least partially visible — see §12.6 for our sticky-header handling.)
- **Color contrast ≥ 4.5:1** for body text, ≥ 3:1 for large text and UI components. Enforced via Tailwind theme tokens; verified by axe at runtime.
- **Target size ≥ 24×24 CSS pixels** for all interactive elements (WCAG 2.2 SC 2.5.8). Tailwind's `h-9 w-9` (36px) default button passes; icon-only buttons use `h-6 w-6` (24px) minimum. Compact data-table action menus use a Radix dropdown trigger ≥ 24px even if the visual icon is smaller.

### 12.6 Code-level requirements

- **Semantic HTML first** — `<main>`, `<nav>`, `<form>`, `<button>` over `<div onClick>`. ESLint blocks the latter.
- **Don't rely on color alone** — vital-sign abnormalities use an icon + label, not just red text.
- **Labels for every input.** shadcn's `Form` component enforces `FormLabel`; `jsx-a11y/label-has-associated-control` catches raw inputs.
- **Live regions** for async errors and successes so screen readers announce.
- **Keyboard shortcuts** documented and discoverable via the `Command` palette.
- **Skip-to-content link** in the root layout.
- **`<html lang>`** set from the active i18n locale (`jsx-a11y/html-has-lang` checks it).
- **Sticky headers must not obscure focused fields** (WCAG 2.2 SC 2.4.11). Inputs inside scrollable regions use `scroll-margin-top: var(--header-height)` so focusing them scrolls them into view below the sticky header. Verified at runtime by axe's `focus-not-obscured-minimum` rule.
- **Drag-only interactions are forbidden** (WCAG 2.2 SC 2.5.7). Any reorderable list (e.g., dashboard cards, stored AQL query order) must also expose `Move up` / `Move down` buttons next to each item.
- **Authentication is paste-able, password-manager-friendly, and free of cognitive puzzles** (WCAG 2.2 SC 3.3.8). Keycloak login templates are configured accordingly; no `autocomplete="off"` on credential inputs, no `paste="off"`, no CAPTCHA puzzles. Passkeys / WebAuthn supported.
- **Help links appear in the same relative order on every authed page** (WCAG 2.2 SC 3.2.6). A single `<SiteFooter>` component is the only place those links live.
- **Don't make users re-type data they entered earlier in the same workflow** (WCAG 2.2 SC 3.3.7). Multi-step composition forms persist prior-step values; the patient ID and encounter ID flow through related forms automatically.

### 12.7 Manual testing — required, can't be skipped

EN 301 549 explicitly requires manual testing with assistive technologies. **Automated tools cannot certify compliance on their own.** Before tagging v1.0:

- Full keyboard-only pass of every critical flow.
- Screen reader pass with **NVDA on Windows** (most common in NL hospitals) and **VoiceOver on macOS**.
- Page-zoom test at 200% browser zoom.
- High-contrast OS mode (Windows Contrast Themes, macOS Increase Contrast).
- Results documented in `docs/accessibility/manual-test-YYYY-MM-DD.md` — this is the artifact a hospital procurement team or an EU enforcement authority will ask for.

### 12.8 Public accessibility statement

EN 301 549 and EAA both require a public accessibility statement. We ship `/accessibility` route stating: the standard we target (**WCAG 2.2 Level AA**, satisfying EN 301 549 / EAA's current WCAG 2.1 AA baseline and forward-compatible with the upcoming revision), the date of last conformance review, known non-conformances with remediation timeline, and a contact channel for users to report barriers. Statement is in English at v1.0; translated alongside the broader i18n work.

---

## 13. Observability — App Logs, Metrics, Tracing

> **❌ REMOVED in the core-refocus (2026-05-30).** OTel tracing + Tempo/Loki/Prometheus/Grafana
>
> - the 4-layer PHI redaction were removed to focus on the openEHR + EHRbase UI core. **Kept:**
>   `/api/health` + `/api/ready` probes and plain-stdout Pino app logging. This section is retained
>   as the post-core restore reference. See CLAUDE.md → "Deferred (post-core)".

_(Section describes the deferred v1.0 target architecture.)_

### 13.1 Logs (v1.0)

Three streams, kept separate:

| Stream              | What                                                     |
| ------------------- | -------------------------------------------------------- |
| **Audit log**       | NEN 7513 events (§14)                                    |
| **Application log** | Debug/info/warn/error from app code (sanitized — no PHI) |
| **Access log**      | HTTP layer (status, latency, route)                      |

All emit JSON via **Pino v10.x** to stdout (Docker logging driver) and to a separate file mount. Promtail (or Fluent Bit) ships to Loki.

**Why Pino 10 specifically.** Pino 10 (current line, latest 10.3.x as of May 2026) ships three changes that matter for our deployment:

1. **Transport loading hardened against prototype pollution** (PR #2358) — relevant because we run multiple transports (stdout + audit file + OTel) and a compromised transport loader would be a privilege-escalation path in a clinical environment.
2. **Documented threat model** in `SECURITY.md` (PR #2360) — supply-chain transparency for the hospital procurement reviews that always ask "what's the upstream security posture of your dependencies?".
3. **Native Node.js 22+ TypeScript type-stripping support** — we're on Node 24, so we get type-stripping support out of the box.

The only Pino 10 breaking change is **dropping Node.js 18 support**. Our Node 24 runtime is unaffected. Existing Pino 9 transport config (including `pino-opentelemetry-transport`) carries over to Pino 10 without changes.

### 13.2 Distributed tracing — OpenTelemetry

**OpenTelemetry (CNCF graduated) with the OTLP wire protocol.** Reasoning:

- EHRbase and Keycloak both emit OTel natively (EHRbase via the Spring Boot OTel agent; Keycloak ≥ v26.5). Joining their trace context is the only way to see cross-service latency.
- OTLP is vendor-neutral. We ship our own self-hosted Grafana Tempo backend in-EU; the collector endpoint can be repointed without code changes if a hospital later mandates a commercial backend.
- Auto-instrumentation covers `http`, `fetch`, `pg`, `ioredis` out of the box. We only hand-write spans for business operations.
- "Show every request that touched patient X between T1 and T2" becomes a Tempo query — the kind of forensic capability Art. 33 (breach response) and Art. 15 (subject access) need.

**Packages:**

```
@opentelemetry/api
@opentelemetry/sdk-node
@opentelemetry/auto-instrumentations-node     # http, fetch, pg, ioredis
@opentelemetry/exporter-trace-otlp-proto
@opentelemetry/exporter-metrics-otlp-proto
@opentelemetry/resources
@opentelemetry/semantic-conventions
pino-opentelemetry-transport
```

**Bootstrap** (loaded via Node 24 `--import` flag, before app code):

```ts
// src/lib/observability/otel.server.ts
import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { Resource } from '@opentelemetry/resources'
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions'
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-node'

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: 'ehrbase-ui',
    [ATTR_SERVICE_VERSION]: process.env.APP_VERSION ?? 'dev',
  }),
  sampler: new TraceIdRatioBasedSampler(0.1),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT + '/v1/traces',
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT + '/v1/metrics',
    }),
    exportIntervalMillis: 60_000,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-http': {
        // Strip query strings + replace UUIDs in path → PHI redaction layer 1.
        requestHook: (span, request) => {
          const url = ('url' in request ? request.url : '') as string
          const path = url.split('?')[0].replace(/[0-9a-f-]{36}/gi, ':id')
          span.updateName(
            `HTTP ${('method' in request && request.method) || 'GET'} ${path}`,
          )
        },
        ignoreIncomingRequestHook: (req) => req.url === '/api/health',
      },
    }),
  ],
})
sdk.start()
process.on('SIGTERM', () => void sdk.shutdown())
```

The SDK generates W3C `traceparent` headers and propagates them on outbound `fetch` calls automatically — including to EHRbase. With EHRbase's and Keycloak's OTel exporters pointed at the same collector, we get end-to-end traces (browser → BFF → EHRbase → Postgres → back) with zero glue code.

`pino-opentelemetry-transport` ships application logs over OTLP too, so logs are trace-correlated in the same backend.

**Layered PHI redaction:**

| Layer                            | What it does                                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| SDK `requestHook`                | Strips query strings; replaces UUIDs in span paths with `:id`                                                                           |
| Custom span-attribute filter     | Block-list (`http.url.query`, `db.statement`, custom `request.body`)                                                                    |
| Collector `attributes` processor | Drops attrs matching `password\|secret\|token\|email` and known national-patient-ID synonyms (`bsn`, `niss`, `nir`, `kvnr`, `pesel`, …) |
| Collector `transform` processor  | Catch-all UUID → `:id` in span names                                                                                                    |

**Sampling:** head-sample 10% at SDK; tail-sample 100% at collector for errors, slow requests (>p99), `/me/access-log`, admin routes.

### 13.3 Metrics

Metrics flow via the same OTel SDK → Collector → Prometheus (which now natively receives OTLP). Standard process metrics (event-loop lag, GC) plus custom (login attempts, OAuth token refreshes, EHRbase upstream latency, AQL query duration, form submission failures). No `prom-client` dependency.

### 13.4 Health endpoints

- **`/api/health`** — liveness; 200 if process alive. Used by Docker healthcheck for compose startup ordering.
- **`/api/ready`** — readiness; checks Valkey, EHRbase, Keycloak. 503 if any unhealthy.

---

## 14. GDPR & EU Healthcare Audit Logging

> **❌ REMOVED in the core-refocus (2026-05-30).** The NEN-7513 audit subsystem (`logAudit`,
> hash chain, pseudonymization, retention/purge, cold-store WORM, integrity job) and the
> compliance docs (DPIA/DPA/RoPA, breach runbook) were removed to focus the pre-v1.0 build on
> the openEHR + EHRbase UI core. **Deferred, not cancelled** — this MUST be restored before any
> deployment touches real patient data. This section is retained as the restore reference. See
> CLAUDE.md → "Deferred (post-core)".

> **This section is mandatory reading.** Every EU clinical deployment must satisfy **GDPR** in full and the national healthcare-records law at the deployment site. Non-compliance penalties under GDPR Art. 83 reach **€20M or 4 % of global turnover**. The Portuguese DPA fined Hospital do Barreiro €400 000 in 2018 specifically for inadequate access controls and missing audit trails — exactly the kind of failure this section exists to prevent. National laws (e.g. NL: Wabvpz + NEN 7510/7512/7513 + WGBO; DE: §203 StGB + Bundesärzteordnung; FR: PGSSI-S + Code de la santé publique L1110-4) add their own requirements on top — the architecture treats those as configuration over a common EU baseline, not as the baseline itself.

> **What this section is and isn't.** This is the **v1.0 compliance target architecture**. None of it is legally binding _now_ because there are no real patients, no real data, and no operating clinical environment yet. The section exists so we know what v1.0 must look like by the time it ships — schema, hash chain, integrity job, pseudonymization, purge job, DPIA, DPA, retention enforcement, breach runbook all spelled out in one place.

### 14.1 Legal framework

Two regimes are EU-wide and always apply; everything else is national overlay that the deployment configures.

| Regime                              | Source                                                                                                                                                                                                           | What it requires                                                                                                                                                                                                                                               |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GDPR (EU 2016/679)**              | Art. 5, 9, 25, 30, 32, 33–34, 35                                                                                                                                                                                 | Lawful basis, security by design, RoPA, 72-hour breach notification, DPIA for health data                                                                                                                                                                      |
| **EHDS** (EU 2025/327)              | In force 25 Mar 2025, applies from 26 Mar 2027                                                                                                                                                                   | EHR systems must be certified for interoperability + logging                                                                                                                                                                                                   |
| **National healthcare-records law** | Member-state specific                                                                                                                                                                                            | Retention period, audit-log schema, certification scheme. NL examples: Wabvpz + Besluit elektronische gegevensuitwisseling; NEN 7510/7512/7513; WGBO 20-year retention. DE: §203 StGB + national e-prescription rules. FR: PGSSI-S. Configured per deployment. |
| **Audit-log schema**                | NEN 7513:2024 (NL national standard, chosen as our technical implementation because it is the most comprehensive published schema and is a strict superset of ISO 27799 + GDPR Art. 32 requirements — see §14.2) | Specific log-record fields for every access to patient data                                                                                                                                                                                                    |

**Who is who (GDPR Art. 4):**

- **Controller** = healthcare organization (the hospital). Decides why/how PHI is processed.
- **Processor** = whoever operates the UI + EHRbase backend.
- **DPA (Art. 28)** must be signed between controller and processor before any PHI is touched.

**Lawful basis for health data (Art. 9):**

- `9(2)(h)` — provision of healthcare or treatment (main basis for clinical workflows)
- `9(2)(c)` — vital interests (emergency access)
- `9(2)(a)` — explicit consent (research, secondary use)

The lawful basis applicable to each processing activity is recorded in the deployment's **RoPA** (`docs/compliance/RoPA-template.md`) and the **DPIA** (`docs/compliance/DPIA-template.md`), mapped by `purpose` + role + processing activity — NOT embedded as a per-event column on `audit_events`. See the §14.2 note on the removal of the `lawful_basis` column for the reasoning.

### 14.2 Audit-log schema (NEN 7513:2024)

We implement the **NEN 7513:2024** log-record schema as our canonical audit envelope. It is a Dutch national standard, but it is also the **most comprehensive published healthcare-audit-log schema we found** — a strict superset of what ISO 27799 + GDPR Art. 32 require, with every field labelled and validated. Using it means: NL deployments are pre-aligned with national certification; other member-state deployments still satisfy GDPR + ISO 27799 + their national baseline (we have yet to find a national scheme NEN 7513 doesn't cover). If a deployment needs additional national fields, the schema is extended downstream rather than replaced — the EU baseline is fixed.

```ts
// src/lib/audit/schema.ts
import { z } from 'zod'

export const AuditEventSchema = z.object({
  // WHEN
  eventId: z.string().uuid(),
  timestamp: z.string().datetime(),

  // WHO
  actor: z.object({
    userId: z.string(), // Keycloak `sub`
    username: z.string(), // `preferred_username`
    displayName: z.string(),
    roles: z.array(z.string()),
    organization: z.string().optional(),
    onBehalfOf: z.string().optional(),
  }),

  // WHERE FROM
  source: z.object({
    ipAddress: z.string(),
    userAgent: z.string(),
    sessionId: z.string(), // internal, NOT the cookie value
    correlationId: z.string().uuid(),
  }),

  // WHAT (action)
  action: z.enum([
    'READ',
    'CREATE',
    'UPDATE',
    'DELETE',
    'EXPORT',
    'PRINT',
    'QUERY',
    'LOGIN',
    'LOGIN_FAILED',
    'LOGOUT',
    'SESSION_EXPIRED',
    'TOKEN_REFRESH',
    'ACCESS_DENIED',
    'CONSENT_GRANT',
    'CONSENT_WITHDRAW',
    'ADMIN_CHANGE',
  ]),

  // WHAT (target)
  target: z
    .object({
      ehrId: z.string().uuid().optional(),
      subjectIdHash: z.string().optional(), // pseudonymized — see 14.4
      resourceType: z.enum([
        'EHR',
        'COMPOSITION',
        'TEMPLATE',
        'QUERY',
        'FOLDER',
        'CONTRIBUTION',
        'SYSTEM',
      ]),
      resourceId: z.string().optional(),
      archetypeId: z.string().optional(),
    })
    .optional(),

  // WHY
  purpose: z.enum([
    'TREATMENT',
    'EMERGENCY',
    'BILLING',
    'QUALITY_ASSURANCE',
    'RESEARCH',
    'PATIENT_REQUEST',
    'LEGAL_OBLIGATION',
    'SYSTEM_ADMIN',
  ]),

  // OUTCOME
  outcome: z.enum(['SUCCESS', 'FAILURE', 'PARTIAL']),
  outcomeDetail: z.string().optional(), // error code only — NO PHI

  // RETENTION (§14.7, ADR-0027) — selects which AUDIT_RETENTION_DAYS_* env
  // var the purge job consults. Default 'AUDIT_LOG'; auth/break-glass emit
  // 'AUTH_LOG'; clinical writes (M6+) emit 'CLINICAL_RECORD'.
  retentionPolicy: z.enum([
    'CLINICAL_RECORD',
    'AUDIT_LOG',
    'AUTH_LOG',
    'APP_LOG',
    'SESSION',
  ]),
  // Set by the retention purge when the warm row archives to cold storage;
  // EXCLUDED from the canonical hash form so flipping it doesn't break the
  // §14.5 chain.
  s3ArchivedAt: z.string().datetime().optional(),

  // INTEGRITY (14.5)
  previousHash: z.string().optional(),
  hash: z.string(),
})

export type AuditEvent = z.infer<typeof AuditEventSchema>
```

> **Why no `lawfulBasis` column.** Earlier drafts persisted a `lawful_basis` enum (`9(2)(a)…(j)`) on every row. We removed it (M4 / 2026-05-28) because hard-coding the GDPR Article-9 lawful basis at every audit call site couples clinical code to legal classification — a brittle pattern that propagates legal-policy knowledge across the codebase. The legal basis is **determined by the surrounding context** (`purpose` + the actor's role + the controller's RoPA entry, see the [RoPA template](compliance/RoPA-template.md)). The audit envelope retains `purpose`; legal-basis reporting is reconstructed off-line from the RoPA mapping rather than embedded per-row.

**Mandatory events (must produce an audit record):**

| Category       | Events                                                                |
| -------------- | --------------------------------------------------------------------- |
| Authentication | `LOGIN`, `LOGIN_FAILED`, `LOGOUT`, `SESSION_EXPIRED`, `TOKEN_REFRESH` |
| Authorization  | `ACCESS_DENIED`, role/permission changes                              |
| PHI read       | View EHR, view composition, list, search, AQL query                   |
| PHI write      | Create/update/delete composition, EHR creation                        |
| Data export    | Download FHIR, canonical JSON, print                                  |
| Consent        | Grant, withdraw, scope change                                         |
| Admin          | Template upload/delete, user role changes, config                     |

### 14.3 Implementation pattern

A single `logAudit()` helper, **fire-and-forget for performance** but never lossy. Pino writes to **stdout** (captured by container runtime) **and** an additional file transport on a persistent volume, for redundancy.

```ts
// src/lib/audit/logger.server.ts
import pino from 'pino'
import { randomUUID, createHash } from 'crypto'
import { getHeader } from '@tanstack/react-start/server'
import { AuditEventSchema, type AuditEvent } from './schema'
import { valkey } from '~/lib/valkey.server'

const auditLogger = pino({
  level: 'info',
  base: { stream: 'audit' },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: {
    targets: [
      { target: 'pino/file', options: { destination: 1 } }, // stdout
      {
        target: 'pino/file',
        options: {
          destination:
            process.env.AUDIT_LOG_PATH ?? '/var/log/ehrbase-ui/audit.ndjson',
        },
      },
    ],
  },
})

function canonicalize(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj as object).sort())
}

export async function logAudit(
  partial: Omit<
    AuditEvent,
    'eventId' | 'timestamp' | 'source' | 'hash' | 'previousHash'
  > & { source?: Partial<AuditEvent['source']> },
): Promise<void> {
  try {
    const previousHash = (await valkey.get('audit:lastHash')) ?? undefined

    const base: Omit<AuditEvent, 'hash'> = {
      eventId: randomUUID(),
      timestamp: new Date().toISOString(),
      source: {
        ipAddress:
          getHeader('x-forwarded-for')?.split(',')[0]?.trim() ??
          getHeader('x-real-ip') ??
          'unknown',
        userAgent: getHeader('user-agent') ?? 'unknown',
        sessionId: 'anonymous',
        correlationId: getHeader('x-correlation-id') ?? randomUUID(),
        ...partial.source,
      },
      previousHash,
      ...partial,
    }

    const hash = createHash('sha256').update(canonicalize(base)).digest('hex')
    const fullEvent: AuditEvent = { ...base, hash }

    const parsed = AuditEventSchema.safeParse(fullEvent)
    if (!parsed.success) {
      // Log the validation failure separately so we still capture *something*
      auditLogger.error({
        schemaError: parsed.error.format(),
        event: fullEvent,
      })
    }

    auditLogger.info(fullEvent)
    await valkey.set('audit:lastHash', hash)
  } catch (err) {
    // Last-resort: stderr so container runtime still captures it
    console.error('[audit] CRITICAL: failed to write audit event', err, partial)
  }
}
```

Usage inside a server function:

```ts
export const getEhr = createServerFn({ method: 'GET' })
  .inputValidator((d: { ehrId: string }) => d)
  .handler(async ({ data }) => {
    const auth = await requireAuth()
    const response = await fetch(
      `${process.env.EHRBASE_URL}/rest/openehr/v1/ehr/${data.ehrId}`,
      { headers: { Authorization: `Bearer ${auth.accessToken}` } },
    )

    await logAudit({
      actor: {
        userId: auth.user.id,
        username: auth.user.email,
        displayName: auth.user.name,
        roles: auth.user.roles,
      },
      action: 'READ',
      target: { ehrId: data.ehrId, resourceType: 'EHR' },
      purpose: 'TREATMENT',
      lawfulBasis: '9(2)(h)',
      outcome: response.ok ? 'SUCCESS' : 'FAILURE',
      outcomeDetail: response.ok ? undefined : `HTTP ${response.status}`,
      source: { sessionId: auth.sid },
    })

    if (!response.ok) throw new Response('not found', { status: 404 })
    return response.json()
  })
```

In the EHRbase pass-through proxy at `/api/ehrbase/$.ts`, the same `logAudit()` call is invoked after each upstream `fetch`, with action derived from HTTP method and `resourceType` inferred from the URL path.

### 14.4 The paradox — audit logs are themselves PHI

A log saying "user X viewed patient Y's HIV status" is itself health data. Therefore:

- The audit store is in scope for GDPR + the applicable national healthcare-data regime.
- Access to it must be logged (meta-logging — lower volume, separate stream).
- **Pseudonymize patient identifiers in logs.** Store `subjectIdHash = HMAC-SHA256(nationalPatientIdentifier, secret)` rather than the raw identifier — works for any national patient-ID format (NL: BSN; BE: Rijksregisternummer / NISS; FR: NIR / INS; DE: KVNR / eGK; IT: Codice Fiscale; ES: TIS / SIP; PT: NUTS; AT: bPK; PL: PESEL; etc.). Keep the secret in a separate KMS-protected store. This satisfies GDPR Art. 4(5).

### 14.5 Tamper evidence — hash chain

Every audit event embeds the SHA-256 of the previous event's canonical JSON. Modifying any past event invalidates every hash after it.

- The "head" hash is kept in Valkey (`audit:lastHash`).
- A **nightly job** recomputes the chain across the entire warm tier and alerts the DPO on mismatch. M4 ships this as a Nitro scheduled task (ADR-0026) — `tasks/audit/integrity.ts` wraps `src/lib/audit/integrity-job.server.ts::runIntegrityJob()`, which logs `level=error` + POSTs `DPO_ALERT_WEBHOOK` (when set) on a chain break. Manual trigger: `POST /api/admin/audit/tasks/audit:integrity` (role-gated to `audit-reviewer`). Runbook: [`docs/runbooks/audit-log-integrity-check.md`](runbooks/audit-log-integrity-check.md).
- The `s3_archived_at` column added by M4 is **excluded** from the canonical hash form (see `HASH_EXCLUDED_KEYS` in `src/lib/audit/hash-chain.server.ts::canonicalize`) so the retention purge can flip the archive bookkeeping without breaking the chain.
- Optional hardening: anchor the daily-final hash to an external immutable store (S3 Object Lock with retention, or RFC 3161 timestamping).

### 14.6 Storage architecture

```
TanStack Start (pino)
    │
    ├── stdout ─► Docker logging driver ─► Promtail ─► Loki (hot, 90+ days, encrypted at rest)
    │
    └── persistent file ─► daily rotation ─► S3 (cold, WORM Object Lock, 5–20 years)
```

- **Hot store**: Loki or OpenSearch. Encrypted at rest. RBAC restricting reads to auditors only.
- **Cold store**: S3-compatible with Object Lock (WORM mode). **Authoritative immutability** for v1.0 lives in the warm Postgres tier (ADR-0013 append-only trigger); the cold tier is regulatory-grade WORM only when paired with AWS S3 or Ceph RGW. **ADR-0027** ships a `ColdStorageProvider` interface with SeaweedFS (dev-default, best-effort) and AWS S3 (production, COMPLIANCE-mode WORM) implementations. Code in `src/lib/audit/cold-store.{server,factory.server}.ts`. Env-driven selection (`COLD_STORAGE_PROVIDER`); see §19.1.
- **EU/EEA only.** No transfer to third countries without GDPR Art. 46 mechanism.
- **Separation of duties**: log readers ≠ logged users.

### 14.7 Retention — reconciling GDPR minimization with national clinical-record laws

Retention is **deployment-configurable**, not hard-coded, because national clinical-records laws vary widely across the EU (NL: 20 y from last entry under WGBO; DE: 10 y from end of treatment under §10 Berufsordnung, up to 30 y for X-ray records; FR: 20 y from last consultation; UK: pre-Brexit 8 y; AT: 10 y under ÄrzteG; etc.). The defaults below are common European norms; each deployment overrides per the supervisory authority that applies.

| Data type                    | Default retention                           | Basis                                                                                                                            |
| ---------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Clinical record (in EHRbase) | **20 years from last entry** (configurable) | National clinical-records law (NL: WGBO Art. 7:454 BW; DE: §10 BO; FR: CSP R1112-7; etc.)                                        |
| Audit logs                   | **≥ 5 years from log write** (configurable) | National healthcare-audit retention rules (NL: Besluit elektronische gegevensverwerking door zorgaanbieders; ISO 27799 baseline) |
| Auth logs (no PHI link)      | 1 year                                      | GDPR minimization                                                                                                                |
| App logs (no PHI)            | 90 days                                     | GDPR minimization                                                                                                                |
| Session records              | Session lifetime + 24 h                     | GDPR minimization                                                                                                                |

The national clinical-records law is a more specific law than GDPR's general minimization; Art. 6(1)(c) GDPR ("legal obligation") provides the lawful basis to keep records longer than minimization alone would allow.

A daily purge job (`src/lib/audit/retention.server.ts::purgeExpiredAuditEvents()`) evaluates the per-event `retention_policy` enum column (`audit_retention_policy`: `CLINICAL_RECORD` / `AUDIT_LOG` / `AUTH_LOG` / `APP_LOG` / `SESSION`) against the matching `AUDIT_RETENTION_DAYS_*` env var (§19.1), archives the warm row to the cold tier via the ADR-0027 provider, verifies the archive landed, then DELETEs the warm row under the `audit_retention` role (the ONE role granted that bypass; the M2 append-only trigger rejects every other column change even for that role). The job runs nightly via Nitro's scheduled-tasks engine (ADR-0026); manual trigger sits behind `requireRole('audit-reviewer')` at `POST /api/admin/audit/tasks/audit:purge`. Source: `src/lib/audit/retention.server.ts` + `tasks/audit/purge.ts`.

### 14.8 Data-subject rights — required UI features

| Right                  | Article | UI feature                                                                                                          |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| Access                 | 15      | "My record" + **"Who accessed my record"** page                                                                     |
| Rectification          | 16      | Edit composition (creates a new version)                                                                            |
| Erasure                | 17      | Largely overridden by national clinical-records retention law (legal-obligation basis); possible for ancillary data |
| Restriction            | 18      | "Lock record" flag                                                                                                  |
| Portability            | 20      | Export as canonical openEHR JSON + FHIR Bundle                                                                      |
| Object                 | 21      | Withdraw research/secondary-use consent                                                                             |
| No automated decisions | 22      | If AI features added, human-in-the-loop                                                                             |

The "right of access to the audit log itself" — patients can see who accessed their record — is required and reinforced by EHDS. `/me/access-log` is therefore a v1.0 must-have, not a nice-to-have.

### 14.9 Breach notification

- **72 hours** to notify the competent national supervisory authority — Art. 33 (NL: Autoriteit Persoonsgegevens / AP; DE: BfDI + the relevant Landesbeauftragte; FR: CNIL; etc.; the deployment configures the contact details).
- Patient notification "without undue delay" if high risk — Art. 34.
- This makes fast forensic queries over the audit log essential — another reason to ship to Loki/OpenSearch rather than only flat files.

### 14.10 DPIA — mandatory before go-live

A DPIA under Art. 35 is **mandatory** before this UI touches real patient data. EHR systems appear on every EU supervisory authority's list of mandatory DPIA cases that we've checked (NL AP, DE BfDI, FR CNIL, IT Garante, ES AEPD, etc.). Revisit when the architecture changes materially (AI features, cross-border sharing under EHDS).

### 14.11 EHDS — what to prepare for

- **26 Mar 2027** — secure-processing-environment requirements apply.
- **26 Mar 2029** — patient summaries, ePrescriptions, eDispensations exchangeable via MyHealth@EU.
- **26 Mar 2031** — medical images, lab results, discharge reports.

Implication: at v1.0 the data-portability export must support **EEHRxF / FHIR Bundle** in addition to canonical openEHR JSON.

### 14.12 Risk-rated checklist

The "Order" column indicates a relative implementation sequence (1 = must be in place at the first commit that touches PHI; higher numbers = can land later in development but must all be present by v1.0 tag, with the exception of items marked "optional"). The phase plan is tracked outside this document.

| #   | Requirement                                             | Priority       | Order      |
| --- | ------------------------------------------------------- | -------------- | ---------- |
| 1   | NEN 7513 schema, emitted on every PHI access            | **CRITICAL**   | 1          |
| 2   | Audit logs separated from app logs, encrypted at rest   | **CRITICAL**   | 1          |
| 3   | Tokens stay server-side (BFF)                           | **CRITICAL**   | 1          |
| 4   | TLS 1.3, HSTS, secure cookies                           | **CRITICAL**   | 1          |
| 5   | DPIA signed off before real PHI                         | **CRITICAL**   | pre-launch |
| 6   | DPA signed (controller ↔ processor)                     | **CRITICAL**   | pre-launch |
| 7   | Hash chain + nightly integrity job                      | **HIGH**       | 2          |
| 8   | Patient-facing access log view                          | **HIGH**       | 3          |
| 9   | Portability export (canonical JSON + FHIR)              | **HIGH**       | 3          |
| 10  | Pseudonymization of patient IDs in logs                 | **HIGH**       | 2          |
| 11  | Breach runbook + forensic dashboard                     | **HIGH**       | 4          |
| 12  | Retention/purge job (5 y audit, 20 y clinical)          | **HIGH**       | 4          |
| 13  | NEN 7513 sample-of-60 annual review dashboard           | **MEDIUM**     | 4          |
| 14  | Anomaly alerts (off-hours, bulk exports)                | **MEDIUM**     | 5          |
| 15  | EEHRxF / FHIR adapter for EHDS                          | **MEDIUM**     | 5          |
| 16  | Meta-logging of audit log access                        | **MEDIUM**     | 4          |
| 17  | **Trace span PHI redaction (SDK + collector, layered)** | **HIGH**       | 4          |
| 18  | Consent management UI                                   | **LOW–MEDIUM** | 5          |
| 19  | RFC 3161 timestamping of daily hash anchors             | **LOW**        | optional   |

### 14.13 Audit-log review dashboard

NEN 7513 requires that audit logs be **reviewed**, not just stored. The standard's reference-implementation guidance calls for a **sample-of-60** quarterly review (60 randomly-selected access events, examined for legitimacy by a designated reviewer). We adopt this cadence as the EU-baseline review SLA (per the doc re-frame in `docs/REFERENCES.md` and the §14.1 framing).

This section **describes the dashboard's data model + routes**. The **UI implementation lives in M15** (per `docs/IMPLEMENTATION_CHECKLIST.md` and `docs/CLINICAL-UI.md` §7.16) — the dashboard is one of the M15 deliverables, not a v1.0-end concern.

Routes (all guarded by `requireRole('audit-reviewer')`):

| Route                    | Purpose                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/admin/audit/sample`    | Generates a random sample of 60 PHI-access events from the selected quarter. Each row: timestamp, user, patient (pseudonymized initially, with a "reveal" button that itself emits a `META_AUDIT_ACCESS` event), action, justification (if break-glass). Reviewer marks each as `LEGITIMATE`, `QUESTIONABLE`, or `INVESTIGATE`. The decision is persisted as a new audit event. |
| `/admin/audit/search`    | Filter the full log by time range, user, event type, outcome. Always shows pseudonymized patient identifiers; revealing identity emits a `META_AUDIT_ACCESS` event.                                                                                                                                                                                                             |
| `/admin/audit/emergency` | All `EMERGENCY_ACCESS_GRANTED` events from §5.6, sorted by most recent. **24h SLA tracker** highlights events not yet reviewed. This is the most operationally important view; it is the workflow that protects the break-glass pattern from being misused.                                                                                                                     |
| `/admin/audit/anomalies` | Surfacing of automated heuristics: off-hours access, bulk reads (>50 patient records per session), repeated 403s on the same patient by the same user (probing). v1.0 ships basic heuristics; the ML/anomaly-detection story is post-v1.0.                                                                                                                                      |
| `/admin/audit/export`    | CSV export of a query result. Rate-limited to 1/hour/session (§5.9). The export operation is itself an audit event of type `AUDIT_EXPORTED`, including the query parameters and row count.                                                                                                                                                                                      |

The dashboard does not display PHI in its identifying form by default. Every "unmask" action requires an explicit click and emits a `META_AUDIT_ACCESS` event so that auditing the auditors works. This is the requirement that flows from §14.4 (audit logs are themselves PHI).

A separately-rendered, printable PDF view of the quarterly sample-of-60 report exists for filing — this is the physical artefact that goes into the NEN 7510 audit binder, signed by the reviewing party. PDF is generated browser-side via print-to-PDF (no server-side PDF library — see §6.x).

---

## 15. Type-Safe API Client

We generate types and Zod schemas from EHRbase's OpenAPI spec using **orval** (`@orval/zod` mode). Validation of every response across the network boundary is mandatory in clinical software — the server might be a different version than the spec.

```ts
// orval.config.ts
import { defineConfig } from 'orval'

export default defineConfig({
  ehrbase: {
    input: { target: './openapi/ehrbase-openapi.yaml' },
    output: {
      mode: 'split',
      target: './src/lib/api/ehrbase-generated',
      client: 'zod',
      fileExtension: '.ts',
      override: {
        zod: {
          strict: { response: true, query: true, param: true, body: true },
        },
      },
    },
  },
})
```

Server functions parse responses through the generated schemas; client code receives fully typed data.

---

## 16. Project Structure

```
ehrbase-ui/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                 # PR: lint, typecheck, unit+a11y, build, e2e
│   │   ├── security.yml           # Trivy (fs+image), Semgrep, pnpm audit, Gitleaks
│   │   ├── codeql.yml             # GitHub-native SAST
│   │   ├── release.yml            # Tag → GHCR + Cosign sign + SBOM attest
│   │   └── dependency-review.yml  # Block risky deps in PRs
│   ├── dependabot.yml             # npm + actions + docker update schedule
│   ├── CODEOWNERS
│   ├── pull_request_template.md
│   └── ISSUE_TEMPLATE/
│       ├── bug_report.yml
│       ├── feature_request.yml
│       └── security_disclosure.md  # → points to SECURITY.md
│
├── docs/
│   ├── adr/                       # Architecture Decision Records (numbered)
│   │   ├── 0001-stack-choice.md
│   │   ├── 0002-bff-pattern.md
│   │   ├── 0003-ssr-mode.md
│   │   ├── 0004-session-store-valkey.md
│   │   ├── 0005-audit-logging-nen7513.md
│   │   ├── 0006-no-global-state-library.md
│   │   ├── 0007-openehr-form-renderer.md
│   │   ├── 0008-cicd-pipeline.md
│   │   └── 0009-distributed-tracing-phased.md
│   ├── runbooks/
│   │   ├── breach-response.md
│   │   ├── audit-log-integrity-check.md
│   │   ├── keycloak-realm-setup.md
│   │   ├── retention-purge.md
│   │   └── verifying-releases.md   # supply-chain verification for consumers
│   ├── governance/
│   │   ├── CODE_OF_CONDUCT.md
│   │   ├── GOVERNANCE.md          # decision-making, maintainers
│   │   ├── SECURITY.md            # vulnerability disclosure
│   │   └── ROADMAP.md
│   ├── compliance/
│   │   ├── DPIA-template.md
│   │   ├── DPA-template.md
│   │   └── RoPA-template.md       # Art. 30 RoPA template
│   ├── accessibility/
│   │   ├── conformance-statement.md  # source for the /accessibility route
│   │   └── manual-test-YYYY-MM-DD.md # one per release, NVDA + VoiceOver pass
│   └── architecture.md            # this document
│
├── src/
│   ├── routes/
│   │   ├── __root.tsx
│   │   ├── index.tsx
│   │   ├── login.tsx
│   │   ├── _authed/
│   │   │   ├── route.tsx
│   │   │   ├── patients/
│   │   │   ├── compositions/
│   │   │   ├── query.tsx
│   │   │   └── admin/
│   │   ├── me/
│   │   │   └── access-log.tsx     # Art. 15 patient-facing audit view
│   │   ├── accessibility.tsx      # public EAA/EN 301 549 conformance statement
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── login.ts
│   │       │   ├── callback.ts
│   │       │   └── logout.ts
│   │       ├── ehrbase/$.ts       # catch-all authenticated proxy
│   │       ├── health.ts
│   │       └── ready.ts
│   │
│   ├── components/
│   │   ├── ui/                    # shadcn (copied)
│   │   ├── theme/                 # ThemeProvider, theme toggle
│   │   └── features/
│   │       ├── patients/
│   │       ├── openehr/           # FieldRenderer, ArrayFieldRenderer, CompositionViewer
│   │       └── aql/
│   │
│   ├── lib/
│   │   ├── audit/                 # schema.ts, logger.server.ts, integrity.server.ts
│   │   ├── auth/                  # keycloak.server.ts, refresh.server.ts, require-auth.server.ts
│   │   ├── api/ehrbase-generated/ # orval output
│   │   ├── openehr/               # type-mappings, schema-generator, flat-converter
│   │   ├── observability/         # trace-id.server.ts, otel.server.ts
│   │   ├── valkey.server.ts
│   │   ├── session.server.ts
│   │   └── utils.ts
│   │
│   ├── server/functions/          # createServerFn modules per feature
│   ├── hooks/
│   ├── paraglide/                 # generated by Paraglide compiler — DO NOT EDIT
│   │   ├── messages.js            #   typed `m.<key>()` functions
│   │   ├── runtime.js             #   getLocale/setLocale, localizeUrl, deLocalizeUrl
│   │   └── server.js              #   paraglideMiddleware
│   ├── types/
│   ├── styles.css
│   ├── router.tsx
│   └── client.tsx
│
├── messages/                       # source-of-truth translation files (edited by humans)
│   ├── en.json
│   └── <locale>.json               # added when each EU language is enabled (e.g. nl, de, fr, …)
├── project.inlang/                 # Paraglide / inlang project config
│   └── settings.json
├── e2e/                            # Playwright
├── openapi/                        # EHRbase spec, vendored
├── .env.example
├── .npmrc
├── .nvmrc
├── components.json                 # shadcn
├── docker-compose.yml
├── docker-compose.prod.yml
├── Dockerfile
├── eslint.config.ts
├── LICENSE                         # Apache 2.0
├── orval.config.ts
├── package.json
├── pnpm-lock.yaml
├── playwright.config.ts
├── README.md
├── tsconfig.json
├── vite.config.ts
└── vitest.config.ts
```

### 16.1 Type-sharing pattern — derive, never duplicate

A clinical app rewrites schemas many times over its lifetime; the codebase has to stay correct as columns move, enums grow, and route paths change. The rule is **one source of truth per shape, every other usage derives from it**. Re-declared shapes always drift.

The pattern:

| Shape                                                                                                                            | Source of truth                                                                                         | Derivation                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audit-event row + insert types                                                                                                   | Drizzle table `src/db/schema/audit.ts`                                                                  | `createInsertSchema` / `createSelectSchema` from `drizzle-orm/zod` → `AuditEventInsert` / `AuditEventRow` in `src/lib/audit/schema.ts`                    |
| Audit-event controlled vocabularies (`AuditAction`, `AuditPurpose`, `AuditOutcome`, `AuditResourceType`, `AuditRetentionPolicy`) | the pg enums in `src/db/schema/audit.ts`                                                                | `z.enum(<pgEnum>.enumValues)` in `src/lib/audit/schema.ts`                                                                                                |
| Caller input for `logAudit()`                                                                                                    | `LogAuditInputSchema` (Zod) in `src/lib/audit/schema.ts`                                                | `z.infer` → `LogAuditInput`                                                                                                                               |
| Session payload                                                                                                                  | `SessionDataSchema` (Zod) in `src/lib/session.server.ts`                                                | `z.infer` → `SessionData`                                                                                                                                 |
| Break-glass request + persisted grant                                                                                            | `BreakGlassRequestSchema` + `EmergencyGrantSchema` (Zod)                                                | `z.infer` → `BreakGlassRequest` / `EmergencyGrant`                                                                                                        |
| Server-function I/O (Art. 15 access-log)                                                                                         | `AccessLogPageInputSchema` + `Pick<AuditEventRow, …>` in `src/server/functions/access-log.functions.ts` | The client-importable `.functions.ts` owns the FULL contract (input schema + output type) so the server module is a consumer; never re-declares the shape |
| App-route literals                                                                                                               | `routeTree.gen.ts` (TanStack Router auto-generated)                                                     | `Exclude<FileRouteTypes['to'], '/api/...'>` → `AppNavRoute` in `src/lib/router/routes.ts` — used by the sidebar, command palette, breadcrumb resolver     |

Concrete consequences:

- **Adding an audit column** in `src/db/schema/audit.ts` propagates through `createInsertSchema` → `AuditEventInsert` → the `logAudit()` row builder + every consumer that does `Pick<AuditEventRow, …>` — at compile time, not at runtime.
- **Adding a route** in `src/routes/` regenerates `routeTree.gen.ts` and `AppNavRoute` picks it up — `<Link to="...">` autocompletion in the sidebar + command palette updates automatically.
- **No hand-written enum unions** like `type OutcomeKey = 'SUCCESS' | 'FAILURE' | 'PARTIAL'` — those are derivable; if a future enum value is added at the DB level, the switch statement that consumes it MUST break compile to force the i18n + UI to catch up.

The rule the reviewer should apply on every PR: **if a new type literal-lists fields or enum values that already exist in a schema, ask whether `Pick<>` / `z.infer` / `<pgEnum>.enumValues` would derive it instead**.

---

## 17. PNPM, Tooling & Conventions

### Node.js: **24 LTS ("Krypton")**

Node 24 is the active LTS line (Apr 2025 → Apr 2028 maintenance). We pin via `.nvmrc` and `engines` so contributors and CI always agree on a version.

```
# .nvmrc
24
```

```json
// package.json
{
  "engines": { "node": ">=24.0.0", "pnpm": ">=11.0.0" },
  "packageManager": "pnpm@11.0.0"
}
```

### pnpm: **v11**, security defaults ON

pnpm 11 (released April 2026) ships with **supply-chain defenses on by default** that align perfectly with our clinical-software threat model:

- **`minimumReleaseAge: 1440`** (24 hours). A newly published package version is _not installable_ until it has existed on the registry for at least 24 h. This directly mitigates "zero-day publish & spread" attacks like Shai-Hulud (2025) and the TanStack May 2026 compromise (see §27).
- **`blockExoticSubdeps: true`** — refuses installs that reference dependencies via exotic protocols (git URLs, etc.) inside sub-dependencies.
- **Isolated global installs** — `pnpm add -g` no longer pollutes a shared `node_modules`.
- **Pure ESM**; requires Node 22+.

```
# .npmrc — only auth/registry concerns belong here
engine-strict=true
```

```yaml
# pnpm-workspace.yaml — pnpm 11 reads workspace + settings from here
packages:
  - .
# explicit defaults (already on in v11; pinning makes it audit-visible)
minimumReleaseAge: 1440
blockExoticSubdeps: true
auto-install-peers: true
strict-peer-dependencies: false
```

### Vite: **v7.3.x for v1.0**, with v8 as staged upgrade path

Vite **8.0** went stable on 2026-03-12 and is at **8.0.9** as of this writing. It's a major architectural shift — `esbuild` + `Rollup` are replaced by **Rolldown** (a single Rust-based bundler from the VoidZero team). Reported gains: 10-30x faster production builds, Linear reduced their build from 46s to 6s. Same Node.js requirement as Vite 7 (≥20.19 / ≥22.12, we're on 24). Vitest 4.1 supports Vite 8. The official Vite migration guide explicitly says configuration API and plugin hooks are unchanged.

**We're pinning to Vite 7.3.x for v1.0, not Vite 8.** Reason: **TanStack Start has unresolved Vite-8-specific bugs** at the time of writing (May 2026):

- **`TanStack/router#7436`** (filed 2026-05-19): Enabling Vite 8's new `experimental.bundledDev: true` (Full Bundle Mode) in TanStack Start breaks CSS resolution, HMR, and JavaScript loading. Workaround unknown.
- **`TanStack/router#7091`** (filed 2026-04-02): TanStack Start dev server takes 5–12 seconds to cold-start in SPA mode on Vite 8 — was instant on Vite 7.
- **Azure/Windows production regression** (filed in `rolldown-vite` discussions, now archived after Rolldown merged into Vite 8): TanStack Start app silently fails to respond to requests when bundled with Vite 8 in some deployment configurations, despite starting cleanly. No error logs.
- Vite+ early-adopter reports (April 2026) explicitly call out TanStack Start as a framework that "still needs work on the config side" with package-version-conflict issues during migration.

This matches the doc's broader version-pinning philosophy: we pin Keycloak to 26.6.x (not `:latest`), EHRbase to 2.31.x (not `:latest`), and we chose Paraglide partly because it's tested in TanStack's own CI. Adopting Vite 8 today would put us in the position of running two RC-level integrations against each other in production — exactly the kind of supply-chain risk hospital deployments need to avoid.

**Upgrade trigger** — we move to Vite 8 when all three of these are true:

1. TanStack Start ships a release that explicitly declares Vite 8 as a supported peer (i.e., `peerDependencies: { vite: "^7 || ^8" }` or similar).
2. `TanStack/router#7436` and `#7091` are closed (or marked as not affecting our deployment shape).
3. We've reproduced a clean build + dev + production deploy on a feature branch with the upgraded pin, including the Paraglide Vite plugin, the Tailwind v4 Vite plugin, and our full E2E suite passing.

Vite 7.3.x continues to receive **important fixes and security patches** under Vite's release policy (the previous major's latest minor gets backports), so staying on 7.3.x is supported, not legacy. We are not accumulating tech debt by waiting.

### Storybook for the component library

Storybook 9.x (Vite 7 first-class) is used for the component library — every shadcn-customized primitive, every openEHR form-renderer piece (`FieldRenderer`, `ArrayFieldRenderer`, the AQL editor, the audit-review dashboard cells), every state of the empty-error-loading triad.

Three reasons it earns a place in v1.0 even though some greenfield projects defer it:

1. **It is documentation for outside contributors.** This is an open-source project; the design system needs a public surface that doesn't require running the full app to inspect.
2. **It is the testbed for visual states without PHI.** A clinician's "I can't read this in the dim ICU at 03:00" feedback is reproducible against a Storybook story, not against the production app.
3. **Accessibility regressions surface earlier.** The `@storybook/addon-a11y` addon runs `axe-core` against every story on every render. The CI gate from §12 already enforces zero violations on component tests; Storybook surfaces the same violations during development with hot-reload, before the test suite even runs.

Storybook output is built as a static site (`storybook build`) and deployed alongside the main app docs at `/storybook/` — separate origin/path, no PHI in any story, no real Keycloak/EHRbase connection in published builds. Mock data lives under `src/components/__fixtures__/`.

### Conventions

- `.server.ts` suffix for files that must never reach the client bundle.
- Server functions in `src/server/functions/<feature>.functions.ts`.
- `as` casts are forbidden by ESLint config; use Zod parse or type guards.
- Hard-coded UI strings are caught by TypeScript itself: messages live in Paraglide's compiled module (`./paraglide/messages.js`) and every JSX label calls a typed `m.<key>()` function, so a missing or misspelled key is a build error (§11.7).
- Prettier-formatted, lint-pinned in CI.
- **All dependencies pinned to exact versions** in `package.json` (no `^`, no `~`). Dependabot opens PRs with reviewed updates. This is the same principle we apply to GitHub Actions SHA-pinning (§20).

---

## 18. Docker Deployment

### Dockerfile (multi-stage, Node 24, pnpm 11)

```dockerfile
# syntax=docker/dockerfile:1
ARG NODE_VERSION=24

# ── deps ─────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ── builder ──────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

# ── runner ───────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache curl tini && \
    addgroup -S -g 1001 nodejs && \
    adduser -S -u 1001 -G nodejs ehrbase-ui
COPY --from=builder --chown=ehrbase-ui:nodejs /app/.output ./.output
COPY --from=builder --chown=ehrbase-ui:nodejs /app/package.json ./
USER ehrbase-ui
EXPOSE 3000
ENV PORT=3000 HOST=0.0.0.0
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/ready || exit 1
ENTRYPOINT ["/sbin/tini","--"]
CMD ["node", ".output/server/index.mjs"]
```

### docker-compose.yml (development)

```yaml
services:
  ehrbase-db:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: ehrbase
    volumes: [ehrbase_pg:/var/lib/postgresql/data]
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 10s
      timeout: 5s
      retries: 5
    networks: [ehrbase-net]

  ehrbase:
    # Pin to an exact version. Never use :latest in production or compose.
    image: ehrbase/ehrbase:2.31.0
    depends_on:
      ehrbase-db: { condition: service_healthy }
      keycloak: { condition: service_started }
    environment:
      DB_URL: jdbc:postgresql://ehrbase-db:5432/ehrbase
      DB_USER: postgres
      DB_PASS: postgres
      SECURITY_AUTHTYPE: OAUTH
      SECURITY_OAUTH_ISSUER_URI: http://keycloak:8080/realms/ehrbase
      SECURITY_OAUTH_JWK_SET_URI: http://keycloak:8080/realms/ehrbase/protocol/openid-connect/certs
      ADMIN_API_ACTIVE: 'true'
    ports: ['8080:8080']
    networks: [ehrbase-net]

  keycloak-db:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: keycloak
      POSTGRES_DB: keycloak
    volumes: [keycloak_pg:/var/lib/postgresql/data]
    networks: [ehrbase-net]

  keycloak:
    image: quay.io/keycloak/keycloak:26.6
    # No --import-realm: the realm is applied declaratively (and updated in
    # place) by keycloak-config below — ADR-0036.
    command: start-dev
    depends_on: [keycloak-db]
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://keycloak-db:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: keycloak
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
      KC_HOSTNAME_STRICT: 'false'
      KC_HEALTH_ENABLED: 'true'
    ports: ['8180:8080']
    networks: [ehrbase-net]

  # Keycloak configuration-as-code (ADR-0036): one-shot keycloak-config-cli that
  # applies keycloak/config/*.json (realm + clients + dev users) and UPDATES in
  # place on every up. Replaces --import-realm + the old bespoke kcadm shell
  # scripts (grafana-client sync + demo-user seed). Realm-dependent services
  # (ehrbase, ui, grafana) gate on this completing, not on keycloak's health.
  keycloak-config:
    image: adorsys/keycloak-config-cli:6.5.1-26.5.5
    depends_on:
      keycloak: { condition: service_healthy }
    environment:
      KEYCLOAK_URL: http://keycloak:8080
      KEYCLOAK_USER: admin
      KEYCLOAK_PASSWORD: admin
      IMPORT_VARSUBSTITUTION_ENABLED: 'true'
      IMPORT_FILES_LOCATIONS: '/config/*.json'
    volumes: [./keycloak/config:/config:ro]
    networks: [ehrbase-net]
    restart: 'no'

  # Valkey is the Linux-Foundation BSD-licensed fork of Redis 7.2.4.
  # Wire-compatible; existing Redis clients (ioredis, etc.) work unchanged.
  valkey:
    image: valkey/valkey:9-alpine
    command: ['valkey-server', '--appendonly', 'yes']
    volumes: [valkey_data:/data]
    networks: [ehrbase-net]
    healthcheck:
      test: ['CMD', 'valkey-cli', 'ping']
      interval: 10s
      timeout: 3s
      retries: 5

  loki:
    image: grafana/loki:3.0.0
    command: -config.file=/etc/loki/local-config.yaml
    ports: ['3100:3100']
    networks: [ehrbase-net]

  # ─── OBSERVABILITY STACK (uncomment together; ship as one unit) ────────────
  # otel-collector:
  #   image: otel/opentelemetry-collector-contrib:0.110.0
  #   command: ["--config=/etc/otel-collector-config.yaml"]
  #   volumes:
  #     - ./otel/collector-config.yaml:/etc/otel-collector-config.yaml:ro
  #   ports:
  #     - "4317:4317"   # OTLP gRPC
  #     - "4318:4318"   # OTLP HTTP
  #   networks: [ ehrbase-net ]
  #
  # tempo:
  #   image: grafana/tempo:2.6.0
  #   command: ["-config.file=/etc/tempo.yaml"]
  #   volumes:
  #     - ./tempo/tempo.yaml:/etc/tempo.yaml:ro
  #     - tempo_data:/var/tempo
  #   networks: [ ehrbase-net ]
  #
  # prometheus:
  #   image: prom/prometheus:v3.0.0
  #   command:
  #     - --config.file=/etc/prometheus/prometheus.yml
  #     - --web.enable-otlp-receiver
  #   volumes:
  #     - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
  #     - prometheus_data:/prometheus
  #   networks: [ ehrbase-net ]
  # ───────────────────────────────────────────────────────────────────────────

  ui:
    build: { context: ., dockerfile: Dockerfile }
    depends_on:
      ehrbase: { condition: service_started }
      keycloak: { condition: service_started }
      valkey: { condition: service_healthy }
    environment:
      NODE_ENV: production
      PORT: '3000'
      EHRBASE_URL: http://ehrbase:8080/ehrbase/rest/openehr/v1
      KEYCLOAK_REALM_URL: http://keycloak:8080/realms/ehrbase
      KEYCLOAK_CLIENT_ID: ehrbase-ui
      KEYCLOAK_CLIENT_SECRET: ${KEYCLOAK_CLIENT_SECRET}
      KEYCLOAK_REDIRECT_URI: http://localhost:3000/api/auth/callback
      VALKEY_URL: redis://valkey:6379
      AUDIT_LOG_PATH: /var/log/ehrbase-ui/audit.ndjson
      AUDIT_PSEUDONYM_SECRET: ${AUDIT_PSEUDONYM_SECRET}
      # ─── OpenTelemetry (set OTEL_ENABLED=true alongside collector boot) ──
      OTEL_ENABLED: 'false'
      OTEL_EXPORTER_OTLP_ENDPOINT: http://otel-collector:4318
      OTEL_SERVICE_NAME: ehrbase-ui
      OTEL_TRACES_SAMPLER: parentbased_traceidratio
      OTEL_TRACES_SAMPLER_ARG: '0.1'
      OTEL_LOG_LEVEL: warn
      # ─────────────────────────────────────────────────────────────────────
    volumes:
      - audit_logs:/var/log/ehrbase-ui
    ports: ['3000:3000']
    networks: [ehrbase-net]

volumes:
  ehrbase_pg:
  keycloak_pg:
  valkey_data:
  audit_logs:
  # tempo_data:       # observability stack
  # prometheus_data:  # observability stack

networks:
  ehrbase-net:
    driver: bridge
```

### Health & readiness

```ts
// src/routes/api/ready.ts
import { createFileRoute } from '@tanstack/react-router'
import { valkey } from '~/lib/valkey.server'

export const Route = createFileRoute('/api/ready')({
  server: {
    handlers: {
      GET: async () => {
        const checks: Record<string, 'ok' | 'fail'> = {}
        try {
          await valkey.ping()
          checks.valkey = 'ok'
        } catch {
          checks.valkey = 'fail'
        }
        try {
          const r = await fetch(`${process.env.EHRBASE_URL}/`, {
            method: 'HEAD',
          })
          checks.ehrbase = r.ok ? 'ok' : 'fail'
        } catch {
          checks.ehrbase = 'fail'
        }
        try {
          const r = await fetch(
            `${process.env.KEYCLOAK_REALM_URL}/.well-known/openid-configuration`,
          )
          checks.keycloak = r.ok ? 'ok' : 'fail'
        } catch {
          checks.keycloak = 'fail'
        }
        const allOk = Object.values(checks).every((v) => v === 'ok')
        return Response.json(
          { status: allOk ? 'ready' : 'unready', checks },
          { status: allOk ? 200 : 503 },
        )
      },
    },
  },
})
```

---

## 19. Environments & Secrets

| Environment | Purpose                           | Where                                                |
| ----------- | --------------------------------- | ---------------------------------------------------- |
| local       | dev workstation                   | docker-compose, plaintext `.env.local` (git-ignored) |
| ci          | tests                             | GitHub Actions secrets                               |
| staging     | pre-prod, fake-but-realistic data | secrets manager (Vault / cloud KMS / Doppler)        |
| production  | real PHI                          | secrets manager, mandatory                           |

**Never** commit secrets. **Never** put real PHI in non-production. The `.env.example` shipped in the repo only contains placeholders.

Mandatory production secrets:

- `KEYCLOAK_CLIENT_SECRET`
- `AUDIT_PSEUDONYM_SECRET` (HMAC key for §14.4)
- `VALKEY_PASSWORD`
- DB credentials (managed at the EHRbase layer)

### 19.1 M4 audit-governance env vars (added 2026-05-28)

The retention + cold-storage layer (§14.6 / §14.7, ADR-0027) is fully env-driven so a deployment can pick its provider and tune cutoffs per the applicable national clinical-records law without code changes. The Nitro task schedule (ADR-0026) is also env-overridable so windows can shift per ops calendar.

| Var                                                   | Purpose                                              | Default                              |
| ----------------------------------------------------- | ---------------------------------------------------- | ------------------------------------ |
| `COLD_STORAGE_PROVIDER`                               | `seaweedfs` (dev) / `aws` (prod-WORM) / `none` (off) | `none` (factory log states the mode) |
| `COLD_STORAGE_BUCKET`                                 | S3 bucket name                                       | `audit-archive`                      |
| `COLD_STORAGE_REGION`                                 | AWS region (any value for SeaweedFS)                 | `us-east-1`                          |
| `COLD_STORAGE_ENDPOINT`                               | SeaweedFS / S3-compatible endpoint URL               | unset (required for `seaweedfs`)     |
| `COLD_STORAGE_ACCESS_KEY` / `COLD_STORAGE_SECRET_KEY` | Credentials                                          | unset (required for any provider)    |
| `COLD_STORAGE_OBJECT_LOCK_MODE`                       | `COMPLIANCE` / `GOVERNANCE`                          | `COMPLIANCE`                         |
| `AUDIT_RETENTION_DAYS_CLINICAL_RECORD`                | Warm retention before cold archive                   | `7300` (20y)                         |
| `AUDIT_RETENTION_DAYS_AUDIT_LOG`                      | "                                                    | `1825` (5y)                          |
| `AUDIT_RETENTION_DAYS_AUTH_LOG`                       | "                                                    | `365` (1y)                           |
| `AUDIT_RETENTION_DAYS_APP_LOG`                        | "                                                    | `90`                                 |
| `AUDIT_RETENTION_DAYS_SESSION`                        | "                                                    | `2`                                  |
| `AUDIT_PURGE_BATCH_SIZE`                              | Rows processed per inner batch                       | `100`                                |
| `AUDIT_INTEGRITY_CRON`                                | Nightly integrity task cron expression               | `0 3 * * *` (03:00 daily)            |
| `AUDIT_PURGE_CRON`                                    | Daily purge task cron expression                     | `0 4 * * *` (04:00 daily)            |
| `AUDIT_TASKS_DISABLED`                                | Kill-switch — both tasks no-op when `true`           | unset                                |
| `AUDIT_RETENTION_DB_URL`                              | Retention-role connection (audit_retention)          | dev default                          |
| `DPO_ALERT_WEBHOOK`                                   | POST target for chain-break alerts                   | unset                                |

The `audit_writer` role (M2 / ADR-0013) has INSERT + SELECT only. The new `audit_retention` role (ADR-0027) is the ONE identity allowed to DELETE warm rows + UPDATE `s3_archived_at`; the BEFORE-trigger rejects every other column change even for that role. Production must rotate the dev passwords for both roles.

---

## 20. CI/CD Pipeline (GitHub Actions)

### 20.1 Principles

CI/CD is **foundation, not polish**. Workflows ship from the first commit. The pipeline enforces security and quality gates that a clinical app cannot compromise on:

1. **Pin every third-party action to a full commit SHA**, not a tag. Tags are mutable and have been exploited in real-world attacks (tj-actions/changed-files, Mar 2025; Laravel-Lang, May 2026). A pinned SHA is immutable. Dependabot (configured for `github-actions`) opens PRs with reviewed SHA updates.
2. **Minimum-privilege `GITHUB_TOKEN`.** Default workflow permissions set to `read-all`. Only jobs that need to write (publish images, attach attestations) request `id-token: write` or `packages: write` explicitly.
3. **Keyless signing via Sigstore Cosign.** No long-lived signing keys. GitHub's OIDC token requests a short-lived certificate from Fulcio; the signature is recorded in the Rekor transparency log. This is essential for EHDS interoperability certification later.
4. **SBOM on every release.** Generated with Syft, attached to the image as a Cosign attestation. Regulators (EHDS Annex II) and hospital procurement increasingly require this.
5. **Container vulnerability scanning fails the build** on HIGH/CRITICAL CVEs. Trivy scans both the filesystem (source) and the built image.
6. **Branch protection on `main`.** Required status checks, 1 approval, linear history, signed commits, no force-push. Production secrets live in **GitHub Environments** with manual approval gates.
7. **Runner hardening.** `step-security/harden-runner` audits egress, blocks unexpected network calls. Catches malicious actions exfiltrating secrets.
8. **No `pull_request_target`** on this repo. The pattern is dangerous on public repos (executes fork code with secrets); we use `pull_request` only.

### 20.2 Workflow inventory

| File                                      | Trigger                          | Purpose                                                               |
| ----------------------------------------- | -------------------------------- | --------------------------------------------------------------------- |
| `.github/workflows/ci.yml`                | `pull_request`, `push` to `main` | Lint, typecheck, unit + a11y, build, E2E                              |
| `.github/workflows/security.yml`          | `pull_request`, weekly schedule  | Trivy (FS + image), Semgrep SAST, `pnpm audit`, hidden-secret scan    |
| `.github/workflows/codeql.yml`            | `pull_request`, weekly schedule  | GitHub-native SAST (JS/TS)                                            |
| `.github/workflows/release.yml`           | Git tag `v*`                     | Build, push to GHCR, Cosign keyless sign, SBOM attest, GitHub Release |
| `.github/workflows/dependency-review.yml` | `pull_request`                   | Block PRs introducing dependencies with HIGH/CRITICAL CVEs            |
| `.github/dependabot.yml`                  | scheduled                        | Daily npm, weekly github-actions, weekly docker base-image updates    |

### 20.3 `ci.yml` — main pull-request workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  quality:
    name: Lint, typecheck, unit
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    steps:
      - name: Harden runner
        uses: step-security/harden-runner@SHA # pin to a real SHA when adding
        with:
          egress-policy: audit

      - uses: actions/checkout@SHA # actions/checkout@v6
        with:
          persist-credentials: false

      - name: Install pnpm
        uses: pnpm/action-setup@SHA # pnpm/action-setup@v6
        with:
          version: 11

      - name: Setup Node.js
        uses: actions/setup-node@SHA # actions/setup-node@v6
        with:
          node-version-file: '.nvmrc'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm tsc --noEmit

      - name: Lint
        run: pnpm eslint . --max-warnings=0

      - name: Unit + accessibility tests
        run: pnpm vitest run --coverage

      - name: Upload coverage
        uses: actions/upload-artifact@SHA # actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/
          retention-days: 14

  build:
    name: Build app
    runs-on: ubuntu-24.04
    needs: quality
    timeout-minutes: 15
    steps:
      - name: Harden runner
        uses: step-security/harden-runner@SHA
        with: { egress-policy: audit }
      - uses: actions/checkout@SHA
      - uses: pnpm/action-setup@SHA
        with: { version: 11 }
      - uses: actions/setup-node@SHA
        with: { node-version-file: '.nvmrc', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build

  e2e:
    name: Playwright E2E
    runs-on: ubuntu-24.04
    needs: quality
    timeout-minutes: 30
    steps:
      - name: Harden runner
        uses: step-security/harden-runner@SHA
        with: { egress-policy: audit }
      - uses: actions/checkout@SHA
      - uses: pnpm/action-setup@SHA
        with: { version: 11 }
      - uses: actions/setup-node@SHA
        with: { node-version-file: '.nvmrc', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - name: Start dependent services
        run: docker compose -f docker-compose.ci.yml up -d --wait
      - run: pnpm playwright test
      - name: Upload Playwright report on failure
        if: failure()
        uses: actions/upload-artifact@SHA
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 14
```

### 20.4 `security.yml` — scans on every PR + weekly

```yaml
# .github/workflows/security.yml
name: Security

on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: '17 6 * * 1' # Mondays 06:17 UTC

permissions:
  contents: read
  security-events: write # for SARIF upload to GitHub Security tab

jobs:
  trivy-fs:
    name: Trivy filesystem scan
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - uses: step-security/harden-runner@SHA
        with: { egress-policy: audit }
      - uses: actions/checkout@SHA
      - name: Trivy filesystem
        uses: aquasecurity/trivy-action@SHA
        with:
          scan-type: fs
          scan-ref: .
          format: sarif
          output: trivy-fs.sarif
          severity: HIGH,CRITICAL
          exit-code: '1'
          ignore-unfixed: true
      - name: Upload SARIF
        if: always()
        uses: github/codeql-action/upload-sarif@SHA
        with: { sarif_file: trivy-fs.sarif, category: trivy-fs }

  trivy-image:
    name: Trivy container image scan
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    steps:
      - uses: step-security/harden-runner@SHA
        with: { egress-policy: audit }
      - uses: actions/checkout@SHA
      - uses: docker/setup-buildx-action@SHA
      - name: Build image (no push)
        uses: docker/build-push-action@SHA
        with:
          context: .
          push: false
          load: true
          tags: ehrbase-ui:ci-${{ github.sha }}
      - name: Trivy image
        uses: aquasecurity/trivy-action@SHA
        with:
          image-ref: ehrbase-ui:ci-${{ github.sha }}
          format: sarif
          output: trivy-image.sarif
          severity: HIGH,CRITICAL
          exit-code: '1'
          ignore-unfixed: true
      - if: always()
        uses: github/codeql-action/upload-sarif@SHA
        with: { sarif_file: trivy-image.sarif, category: trivy-image }

  semgrep:
    name: Semgrep SAST
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - uses: step-security/harden-runner@SHA
        with: { egress-policy: audit }
      - uses: actions/checkout@SHA
      - uses: returntocorp/semgrep-action@SHA
        with: { config: 'p/owasp-top-ten p/javascript p/typescript p/react' }

  pnpm-audit:
    name: pnpm audit (production deps)
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    steps:
      - uses: step-security/harden-runner@SHA
        with: { egress-policy: audit }
      - uses: actions/checkout@SHA
      - uses: pnpm/action-setup@SHA
        with: { version: 11 }
      - run: pnpm audit --prod --audit-level=high

  gitleaks:
    name: Gitleaks (secrets scan)
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    steps:
      - uses: step-security/harden-runner@SHA
        with: { egress-policy: audit }
      - uses: actions/checkout@SHA
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@SHA
```

### 20.5 `codeql.yml` — GitHub-native SAST

```yaml
# .github/workflows/codeql.yml
name: CodeQL

on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: '37 7 * * 1'

permissions:
  contents: read
  security-events: write

jobs:
  analyze:
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    steps:
      - uses: step-security/harden-runner@SHA
        with: { egress-policy: audit }
      - uses: actions/checkout@SHA
      - uses: github/codeql-action/init@SHA
        with:
          languages: javascript-typescript
          queries: security-extended,security-and-quality
      - uses: github/codeql-action/analyze@SHA
        with: { category: '/language:javascript-typescript' }
```

### 20.6 `release.yml` — signed, attested releases

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags: ['v*.*.*']

permissions:
  contents: read

jobs:
  release:
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    permissions:
      contents: write # create GitHub Release
      packages: write # push to GHCR
      id-token: write # OIDC for Cosign keyless
      attestations: write # provenance attestations
    env:
      REGISTRY: ghcr.io
      IMAGE_NAME: ${{ github.repository }} # rubentalstra/ehrbase-ui
    steps:
      - uses: step-security/harden-runner@SHA
        with: { egress-policy: audit }

      - uses: actions/checkout@SHA

      - uses: docker/setup-qemu-action@SHA
      - uses: docker/setup-buildx-action@SHA

      - name: Log in to GHCR
        uses: docker/login-action@SHA
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@SHA
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=sha,prefix=sha-,format=short

      - name: Build and push (multi-arch)
        id: build
        uses: docker/build-push-action@SHA
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          provenance: true
          sbom: true

      - name: Install Cosign
        uses: sigstore/cosign-installer@SHA

      - name: Cosign keyless sign (OIDC)
        env:
          DIGEST: ${{ steps.build.outputs.digest }}
          TAGS: ${{ steps.meta.outputs.tags }}
        run: |
          echo "${TAGS}" | xargs -I{} cosign sign --yes "{}@${DIGEST}"

      - name: Install Syft
        uses: anchore/sbom-action/download-syft@SHA

      - name: Generate SBOM (SPDX)
        env:
          DIGEST: ${{ steps.build.outputs.digest }}
        run: |
          syft "${REGISTRY}/${IMAGE_NAME}@${DIGEST}" \
            -o spdx-json=sbom.spdx.json \
            -o cyclonedx-json=sbom.cdx.json

      - name: Attest SBOM (signed, recorded in Rekor)
        env:
          DIGEST: ${{ steps.build.outputs.digest }}
        run: |
          cosign attest --yes \
            --type spdxjson \
            --predicate sbom.spdx.json \
            "${REGISTRY}/${IMAGE_NAME}@${DIGEST}"

      - name: GitHub artifact attestation
        uses: actions/attest-build-provenance@SHA
        with:
          subject-name: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          subject-digest: ${{ steps.build.outputs.digest }}
          push-to-registry: true

      - name: Create GitHub Release
        uses: softprops/action-gh-release@SHA
        with:
          generate_release_notes: true
          files: |
            sbom.spdx.json
            sbom.cdx.json
```

### 20.7 `dependency-review.yml`

```yaml
# .github/workflows/dependency-review.yml
name: Dependency Review

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    runs-on: ubuntu-24.04
    steps:
      - uses: step-security/harden-runner@SHA
        with: { egress-policy: audit }
      - uses: actions/checkout@SHA
      - uses: actions/dependency-review-action@SHA
        with:
          fail-on-severity: high
          deny-licenses: GPL-2.0, GPL-3.0, AGPL-3.0
          comment-summary-in-pr: on-failure
```

### 20.8 `dependabot.yml`

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: '/'
    schedule: { interval: daily }
    open-pull-requests-limit: 10
    versioning-strategy: increase-if-necessary
    labels: ['dependencies', 'npm']
    groups:
      tanstack:
        patterns: ['@tanstack/*']
      shadcn:
        patterns: ['@radix-ui/*', 'lucide-react', 'class-variance-authority']
      tooling:
        patterns:
          ['eslint*', 'prettier*', '@types/*', 'typescript', 'vite*', 'vitest*']

  - package-ecosystem: github-actions
    directory: '/'
    schedule: { interval: weekly }
    labels: ['dependencies', 'github-actions']

  - package-ecosystem: docker
    directory: '/'
    schedule: { interval: weekly }
    labels: ['dependencies', 'docker']
```

### 20.9 Verifying release signatures (consumer side)

Anyone pulling a released image can verify it was built by this repo's release workflow:

```bash
# Verify the image signature
cosign verify \
  --certificate-identity-regexp="^https://github.com/rubentalstra/ehrbase-ui/" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  ghcr.io/rubentalstra/ehrbase-ui:v1.0.0

# Verify the SBOM attestation
cosign verify-attestation \
  --type spdxjson \
  --certificate-identity-regexp="^https://github.com/rubentalstra/ehrbase-ui/" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  ghcr.io/rubentalstra/ehrbase-ui:v1.0.0
```

This will go into `docs/runbooks/verifying-releases.md` so hospital security teams can validate the supply chain themselves.

### 20.10 Branch protection (configured in repo settings)

- Require pull request reviews: **1 approving review**, dismiss stale on new commits
- Require status checks: `quality`, `build`, `e2e`, `trivy-fs`, `trivy-image`, `semgrep`, `pnpm-audit`, `gitleaks`, `codeql`, `dependency-review`
- Require **signed commits**
- Require **linear history**
- Block force-pushes
- Restrict deletions

### 20.11 Operational notes

- **About `@SHA` placeholders**: every `SHA` above is a placeholder. When wiring the workflows, replace each with the full 40-character commit SHA of a known-good action release, captured as a comment with the human-readable version next to it. Dependabot keeps these current. Example: `uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1`.
- **GitHub Environments**: create at least `production` with required reviewers + secrets. Releases deploying to production must reference the environment.
- **Cache scope**: Trivy DB and pnpm store benefit from caching; `setup-node` with `cache: 'pnpm'` handles the pnpm side automatically.
- **Self-hosted runners**: not used in v1. If introduced later (e.g. for hospital-internal infra), apply the same hardening principles and isolate runner networks.

---

## 21. Backup & Disaster Recovery

_(Section describes v1.0 deployment target. During pre-v1.0 development, the docker-compose stack has zero persistence guarantees — wipe it whenever, no migrations, no users to lose.)_

| Asset                              | Method                                              | RPO             | RTO             |
| ---------------------------------- | --------------------------------------------------- | --------------- | --------------- |
| EHRbase Postgres                   | streaming WAL → object storage; nightly base backup | 5 min           | 1 h             |
| Audit logs (cold)                  | S3 Object Lock, cross-region replication            | 0 (synchronous) | n/a (read-only) |
| Keycloak Postgres                  | nightly dump + WAL                                  | 1 h             | 1 h             |
| Valkey (sessions)                  | acceptable to lose; users re-login                  | n/a             | n/a             |
| Container images                   | registry redundancy                                 | n/a             | minutes         |
| Configuration (IaC, k8s manifests) | git                                                 | n/a             | minutes         |

Post-v1.0: quarterly restore drill — pick a date, restore Postgres to that point on a sandbox cluster, smoke-test EHR retrieval. Document outcome in `docs/runbooks/dr-drill-YYYY-Q.md`.

---

## 22. Performance Budgets

_(Section describes v1.0 release gates. Budgets are enforced in CI; during early development they are observed but not gated.)_

| Metric                                        | Budget                              |
| --------------------------------------------- | ----------------------------------- |
| Initial JS bundle (gzip)                      | ≤ 200 KB                            |
| Total JS for first authenticated route (gzip) | ≤ 350 KB                            |
| TTFB (cached SSR)                             | ≤ 200 ms p95                        |
| LCP on patient list                           | ≤ 2.5 s p95                         |
| INP                                           | ≤ 200 ms p95                        |
| Server function p95 latency (non-AQL)         | ≤ 300 ms                            |
| AQL query p95 latency                         | ≤ 2 s (subject to query complexity) |

Measured via Lighthouse in CI for a defined set of fixture routes, and in production via Real-User Monitoring (RUM) — `web-vitals` library posting to a metrics endpoint.

---

## 23. Browser Support Matrix

Hospital workstations are often locked. We commit to:

| Browser       | Minimum version | Notes                 |
| ------------- | --------------- | --------------------- |
| Chrome / Edge | last 2 stable   | primary target        |
| Firefox       | last 2 stable   | secondary             |
| Safari        | 16+             | for staff using iPads |

Older browsers see a soft-block landing page with upgrade instructions and a support contact. We do **not** ship legacy ES5 bundles.

---

## 24. Testing Strategy

| Layer                 | Tool                                 | What                                                          |
| --------------------- | ------------------------------------ | ------------------------------------------------------------- |
| Unit                  | **Vitest**                           | utils, schema generators, FLAT converter, audit hash          |
| Component             | Vitest + Testing Library             | shadcn-composed forms, dynamic field renderer                 |
| Accessibility         | `vitest-axe`, `@axe-core/playwright` | every component test, every E2E flow                          |
| API contract          | Vitest + MSW                         | server functions mocking EHRbase                              |
| E2E                   | **Playwright**                       | login flow, create composition, AQL query, patient access log |
| Load                  | k6 (optional)                        | sustained AQL query throughput                                |
| Audit chain integrity | dedicated nightly job + Vitest unit  | recompute hash, assert no breaks                              |

Coverage gates: 80 % statements on `src/lib`, 60 % overall. Audit and auth modules pinned to 90 %.

---

## 25. Governance, License, Repository Layout

### Repository identity

- **Name:** `ehrbase-ui`
- **Owner (initial):** [`rubentalstra`](https://github.com/rubentalstra) — personal account. Can be transferred to an organization later (the EHRbase team, a foundation, or a dedicated org) once contributors and governance justify it.
- **Full path:** `github.com/rubentalstra/ehrbase-ui`
- **Description (GitHub `About` / npm `description` / social previews):**
  > The missing open-source UI for EHRbase. Clinical workspace, dynamic openEHR forms, AQL query builder. TanStack Start + React 19 + shadcn/ui + Keycloak. Built for EU clinical deployments — GDPR-compliant, with a comprehensive audit-log schema that satisfies EU healthcare audit requirements (ISO 27799 baseline) and meets every member-state national standard we've checked, including NEN 7513 (NL).
- **GitHub topics** to add for discoverability: `ehrbase`, `openehr`, `electronic-health-record`, `ehr`, `clinical-data`, `tanstack-start`, `react`, `shadcn-ui`, `keycloak`, `gdpr`, `ehds`, `iso-27799`, `nen-7513`, `healthcare`, `medical-software`
- **Suggested initial README headline:** _The missing open-source UI for EHRbase._

### License: **Apache 2.0**

Chosen because:

- **Matches EHRbase** — derivatives / integrations stay license-compatible.
- **Explicit patent grant** — important for healthcare software.
- **Permissive enough** for hospital adoption (most hospitals' legal teams accept Apache 2.0).
- **AGPL would scare off adopters**; MIT lacks the patent grant.

The `LICENSE` file is `Apache-2.0`. Each source file carries a short SPDX header:

```
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 The EHRbase UI Contributors
```

### Governance docs (`docs/governance/`)

- **CODE_OF_CONDUCT.md** — Contributor Covenant 2.1.
- **GOVERNANCE.md** — initial benevolent-dictator model with named maintainer(s); transition to a small steering group once ≥3 active maintainers.
- **SECURITY.md** — vulnerability disclosure: a private security email, 90-day disclosure window, CVE coordination.
- **CONTRIBUTING.md** — DCO sign-off, conventional commits, PR template, dev setup.
- **ROADMAP.md** — public phase plan (tracked outside this document).

### ADRs (`docs/adr/`)

One per significant decision, immutable once accepted. Format: title, status, context, decision, consequences. We have seeded a starter set (0001–0008 listed in §16).

### Runbooks (`docs/runbooks/`)

Operational procedures: breach response, audit log integrity check, Keycloak realm setup, retention purge, DR drill template.

### Compliance templates (`docs/compliance/`)

- DPIA template (Art. 35)
- DPA template (Art. 28)
- RoPA template (Art. 30)

---

## 26. Risks & Mitigations

| Risk                                                                                                                                                                                                            | Severity          | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **npm supply-chain attack via compromised dependency** (concrete recent example: TanStack May 2026 — CVE-2026-45321, 42 packages tampered via pull_request_target + cache poisoning + runner memory extraction) | **CRITICAL**      | (1) pnpm 11 `minimumReleaseAge: 1440` default — no install of <24h-old versions. (2) Lockfile committed; `pnpm install --frozen-lockfile` in CI. (3) Dependabot PRs reviewed manually. (4) `pnpm audit` gate in CI fails on HIGH/CRITICAL. (5) Trivy + Semgrep scans (§20). (6) Pin TanStack dependencies exactly. (7) Don't use `pull_request_target` in our own workflows.                                                                                                                                                |
| **TanStack Start still RC; API changes**                                                                                                                                                                        | MEDIUM            | Pin all TanStack deps exactly. Time-box framework debugging in CI. Run upgrade PRs through full E2E.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Web template parser misses edge cases**                                                                                                                                                                       | MEDIUM-HIGH       | Start with simple archetypes (vitals); add tests as edge cases surface. Allow manual JSON fallback.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Audit logging slows clinical workflows**                                                                                                                                                                      | HIGH if it occurs | Fire-and-forget design, in-memory queue, pino async transport. Performance budgets enforce p95 latency.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **PHI leaks in error messages or logs**                                                                                                                                                                         | CRITICAL          | Lint rule + code review checklist for error handling. Application log redaction filter. Periodic log audit.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Keycloak misconfiguration leaves system open**                                                                                                                                                                | CRITICAL          | Realm config in version control. Mandatory checks in `/api/ready`. Penetration test before go-live.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **DPIA not done → unlawful processing**                                                                                                                                                                         | CRITICAL          | Pre-launch gate. DPIA template seeded. Legal sign-off required.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Compliance drift (EHDS milestones, NEN revisions) by the time v1.0 ships**                                                                                                                                    | HIGH              | Re-check legal landscape during pre-release hardening, before tagging v1.0. ADR for each material change.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Audit log itself becomes PHI without protection**                                                                                                                                                             | HIGH              | Pseudonymization, encrypted-at-rest store, separation of duties on read access.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **National clinical-records retention (e.g. WGBO 20 y in NL, §10 BO in DE, CSP R1112-7 in FR) vs GDPR minimization tension**                                                                                    | MEDIUM            | Tag-based retention policy, retention period configurable per deployment. Lawful basis explicit (GDPR Art. 6(1)(c) — legal obligation). Document in the deployment's DPIA.                                                                                                                                                                                                                                                                                                                                                  |
| **Trace spans become an unmanaged second PHI store** (URLs, query params, IDs can be Article 9 special-category data)                                                                                           | **HIGH**          | Layered redaction: SDK `requestHook` strips query strings + replaces UUIDs in span names with `:id` placeholders, collector `attributes`/`transform` processors as second line, attribute block-list (no `password\|secret\|token\|email\|nationalId` and known national-ID synonyms — `bsn`, `niss`, `nir`, `kvnr`, `pesel`, etc.), 30-day default retention (vs 5y for audit), DPIA addendum covers trace data scope, role-gated Tempo access.                                                                            |
| **EAA / EN 301 549 non-compliance** — accessibility is legally binding in EU since 28 June 2025; fines up to €100k/violation in some member states                                                              | **CRITICAL**      | Target **WCAG 2.2 AA** (strict superset of 2.1; future-proof for the EN 301 549 revision in progress). Three-layer defense (§12): `eslint-plugin-jsx-a11y` strict config in CI lint gate (`--max-warnings=0`); axe-core via Vitest on every component + via Playwright on every critical flow, configured with `wcag22aa` + `EN-301-549` tags and `target-size` rule explicitly enabled; manual NVDA + VoiceOver pass before v1.0 tag, results in `docs/accessibility/manual-test-*.md`; public `/accessibility` statement. |
| **OTel SDK overhead degrades clinical-workflow latency**                                                                                                                                                        | MEDIUM            | Head-sample 10% by default, async batch export, disable `instrumentation-fs`. Performance budgets (§22) gate new spans.                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Dependency staleness — security debt accruing silently**                                                                                                                                                      | MEDIUM            | Dependabot daily for npm, weekly for actions/docker. Quarterly dependency review meeting. CI fails on outdated lockfile vs `package.json`.                                                                                                                                                                                                                                                                                                                                                                                  |
| **Hospital workstation locked to old browsers**                                                                                                                                                                 | LOW-MEDIUM        | Soft-block page; documented support matrix; no IE/legacy support.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **OSS adoption fails — small contributor pool**                                                                                                                                                                 | MEDIUM            | Apache 2.0; clear contribution guide; tag good-first-issues; engage openEHR Discourse and EHRbase community.                                                                                                                                                                                                                                                                                                                                                                                                                |

---

## 27. References

### Runtime & package manager

- Node.js 24 (Krypton LTS) release — https://nodejs.org/en/blog/release/v24.0.0
- Node.js release schedule — https://nodejs.org/en/about/previous-releases
- pnpm 11 release notes — https://pnpm.io/blog/releases/11.0
- pnpm settings reference — https://pnpm.io/settings
- pnpm minimum release age (supply-chain defense) — https://pnpm.io/settings#minimumreleaseage

### Framework & tooling

- TanStack Start — https://tanstack.com/start/latest
- TanStack Start server functions — https://tanstack.com/start/latest/docs/framework/react/guide/server-functions
- TanStack Start authentication guide — https://tanstack.com/start/latest/docs/framework/react/guide/authentication
- TanStack Start selective SSR — https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr
- TanStack Router — https://tanstack.com/router/latest
- TanStack Query — https://tanstack.com/query/latest
- TanStack Table — https://tanstack.com/table/latest
- TanStack May 2026 supply-chain incident (CVE-2026-45321) — https://security.snyk.io/vuln/SNYK-JS-TANSTACKREACTSTARTCLIENT-16640209
- React 19 release notes — https://react.dev/blog/2024/12/05/react-19
- Vite — https://vitejs.dev
- Vite 8.0 announcement (Mar 12, 2026) — https://vite.dev/blog/announcing-vite8
- Vite 8 migration guide — https://vite.dev/guide/migration
- Vite release policy (7.3.x still receives important fixes & security patches) — https://vite.dev/releases
- Rolldown (Rust bundler powering Vite 8) — https://rolldown.rs
- Vitest 4.1 release notes (Vite 8 support landed) — https://vitest.dev/blog/vitest-4-1
- TanStack/router#7436 — Vite 8 `experimental.bundledDev` breaks CSS/HMR in Start — https://github.com/TanStack/router/issues/7436
- TanStack/router#7091 — Vite 8 slow cold start in Start SPA mode — https://github.com/TanStack/router/issues/7091

### UI / styling

- shadcn/ui (official) — https://ui.shadcn.com
- shadcn/ui TanStack Start setup — https://ui.shadcn.com/docs/installation/tanstack
- shadcn/ui changelog — https://ui.shadcn.com/docs/changelog
- Tailwind CSS v4.3 release — https://tailwindcss.com/blog/tailwindcss-v4-3
- Tailwind CSS — https://tailwindcss.com
- Radix UI — https://www.radix-ui.com

### Forms / validation / editor

- react-hook-form — https://react-hook-form.com
- @hookform/resolvers (≥5.1 for Zod v4) — https://github.com/react-hook-form/resolvers
- Zod v4 — https://zod.dev
- @uiw/react-codemirror — https://github.com/uiwjs/react-codemirror
- @codemirror/lang-sql — https://www.npmjs.com/package/@codemirror/lang-sql

### Internationalization (i18n)

- Paraglide JS (opral/paraglide-js, MIT-licensed) — https://github.com/opral/paraglide-js
- Paraglide JS documentation — https://inlang.com/m/gerre34r/library-inlang-paraglideJs
- Paraglide guide for TanStack Router — https://inlang.com/m/gerre34r/library-inlang-paraglideJs/tanstack-router
- TanStack Router i18n guide (Paraglide recommended) — https://tanstack.com/router/latest/docs/guide/internationalization-i18n
- TanStack official example: `i18n-paraglide` (client-side) — https://github.com/TanStack/router/tree/main/examples/react/i18n-paraglide
- TanStack official example: `start-i18n-paraglide` (server-side, what we follow) — https://github.com/TanStack/router/tree/main/examples/react/start-i18n-paraglide
- Inlang Sherlock (VS Code extension for inline translation editing) — https://inlang.com/m/r7kp499g/app-inlang-ideExtension
- Inlang Fink (translation editor for non-developers) — https://inlang.com/m/tdozzpar/app-inlang-finkLocalizationEditor

### Auth, sessions & data store

- Arctic (OAuth) — https://arcticjs.dev
- Keycloak 26.6 release notes — https://www.keycloak.org/2026/04/keycloak-2660-released
- Keycloak — https://www.keycloak.org
- Valkey (BSD-licensed Redis fork, Linux Foundation) — https://valkey.io
- Valkey downloads — https://valkey.io/download
- Redis license change context (why we use Valkey) — https://en.wikipedia.org/wiki/Valkey
- ioredis (wire-compatible client, works with Valkey unchanged) — https://github.com/redis/ioredis

### Database

- PostgreSQL 18 — https://www.postgresql.org
- PostgreSQL release notes — https://www.postgresql.org/docs/release/
- PostgreSQL Docker official image — https://hub.docker.com/_/postgres

### Observability

- OpenTelemetry (CNCF graduated) — https://opentelemetry.io
- OpenTelemetry status — https://opentelemetry.io/status
- OpenTelemetry JS SDK (Node) — https://opentelemetry.io/docs/languages/js/getting-started/nodejs/
- `@opentelemetry/sdk-node` — https://www.npmjs.com/package/@opentelemetry/sdk-node
- `@opentelemetry/auto-instrumentations-node` — https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node
- OTLP exporter configuration — https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/
- W3C Trace Context — https://www.w3.org/TR/trace-context/
- Semantic conventions — https://opentelemetry.io/docs/specs/semconv/
- OpenTelemetry Collector — https://opentelemetry.io/docs/collector/
- Grafana Tempo (trace storage) — https://grafana.com/oss/tempo/
- Grafana Loki (log aggregation) — https://grafana.com/oss/loki/
- Prometheus (metrics, OTLP receive) — https://prometheus.io
- Pino (v10.x current) — https://github.com/pinojs/pino
- Pino npm — https://www.npmjs.com/package/pino
- Pino v10 breaking-change clarification (Node 18 dropped) — https://github.com/pinojs/pino/issues/2317
- Pino releases (10.x changelog) — https://github.com/pinojs/pino/releases
- pino-opentelemetry-transport — https://github.com/pinojs/pino-opentelemetry-transport
- pino-http — https://github.com/pinojs/pino-http

### openEHR / EHRbase

- EHRbase — https://ehrbase.org · https://github.com/ehrbase/ehrbase
- openEHR specifications — https://specifications.openehr.org
- AQL specification — https://specifications.openehr.org/releases/QUERY/latest/AQL.html
- openEHR Reference Model — https://specifications.openehr.org/releases/RM/latest/

### Accessibility (legal + tooling)

- European Accessibility Act (Directive EU 2019/882) — https://eur-lex.europa.eu/eli/dir/2019/882/oj
- EAA overview (European Commission) — https://ec.europa.eu/social/main.jsp?catId=1202
- EN 301 549 v3.2.1 (harmonized standard) — https://www.etsi.org/deliver/etsi_en/301500_301599/301549/03.02.01_60/en_301549v030201p.pdf
- WCAG 2.1 — https://www.w3.org/TR/WCAG21/
- WCAG 2.2 — https://www.w3.org/TR/WCAG22/
- WCAG quick reference — https://www.w3.org/WAI/WCAG21/quickref/
- ARIA Authoring Practices Guide — https://www.w3.org/WAI/ARIA/apg/
- axe-core (Deque, MPL 2.0) — https://github.com/dequelabs/axe-core
- axe-core supported rule tags including `EN-301-549` — https://github.com/dequelabs/axe-core/blob/develop/doc/API.md#options-parameter
- `@axe-core/playwright` — https://www.npmjs.com/package/@axe-core/playwright
- `vitest-axe` — https://www.npmjs.com/package/vitest-axe
- NVDA screen reader — https://www.nvaccess.org

### ESLint v10 + plugins

- ESLint v10.0.0 release notes — https://eslint.org/blog/2026/02/eslint-v10.0.0-released/
- ESLint v10.4.0 release notes (current, `includeIgnoreFile()` helper) — https://eslint.org/blog/2026/05/eslint-v10.4.0-released/
- ESLint v10 migration guide — https://eslint.org/docs/latest/use/migrate-to-10.0.0
- ESLint version-support policy (v9 EOL: **2026-08-06**) — https://eslint.org/version-support/
- typescript-eslint dependency versions (supports `^8.57 || ^9 || ^10`) — https://typescript-eslint.io/users/dependency-versions/
- typescript-eslint v8 announcement — https://typescript-eslint.io/blog/announcing-typescript-eslint-v8/
- `@eslint-react/eslint-plugin` (used instead of broken `eslint-plugin-react`) — https://www.eslint-react.xyz/
- `eslint-plugin-react` ESLint 10 incompatibility (issue #3977) — https://github.com/jsx-eslint/eslint-plugin-react/issues/3977
- `eslint-plugin-react` ESLint 10 fix PR (blocked since Feb 2026) — https://github.com/jsx-eslint/eslint-plugin-react/pull/3979
- `eslint-plugin-react-hooks` v10 support (PR #35720) — https://github.com/facebook/react/pull/35720
- `eslint-plugin-jsx-a11y-x` (actively-maintained fork, ESLint 9/10) — https://www.npmjs.com/package/eslint-plugin-jsx-a11y-x
- `eslint-plugin-jsx-a11y` (canonical, last published Oct 2024, not yet v10-compatible) — https://github.com/jsx-eslint/eslint-plugin-jsx-a11y

### Security hardening (headers, CSRF, sessions, file uploads)

- OWASP Application Security Verification Standard (ASVS) 5.0 — https://owasp.org/www-project-application-security-verification-standard/
- OWASP Content Security Policy Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html
- MDN — Content Security Policy guide — https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP
- Google strict-CSP guide (nonce + `strict-dynamic`) — https://csp.withgoogle.com/docs/strict-csp.html
- ClamAV documentation — https://docs.clamav.net
- `clamscan` Node.js client — https://www.npmjs.com/package/clamscan
- `rate-limiter-flexible` — https://github.com/animir/node-rate-limiter-flexible
- Storybook — https://storybook.js.org
- Storybook a11y addon — https://storybook.js.org/addons/@storybook/addon-a11y

### Compliance — EU baseline

- GDPR — https://eur-lex.europa.eu/eli/reg/2016/679/oj
- GDPR Art. 9, 30, 32, 33-34, 35 — https://gdpr-info.eu
- EHDS Regulation (EU) 2025/327 — https://eur-lex.europa.eu/eli/reg/2025/327/oj
- ISO 27799 (Health informatics — Information security management) — https://www.iso.org/standard/62777.html
- IHE ATNA (Audit Trail and Node Authentication) — https://profiles.ihe.net/ITI/TF/Volume1/ch-9.html
- EDPB (European Data Protection Board) — https://edpb.europa.eu

### Compliance — national (examples, not exhaustive — each deployment configures its own)

- **NL:** NEN 7513:2024 — https://www.nen.nl/en/nen-7513-2024-nl-329182 • Wabvpz — https://wetten.overheid.nl/BWBR0019769 • Besluit elektronische gegevensverwerking door zorgaanbieders — https://wetten.overheid.nl/BWBR0040076 • WGBO (Boek 7 BW, art. 446-468) — https://wetten.overheid.nl/BWBR0005290 • Autoriteit Persoonsgegevens (AP) — https://autoriteitpersoonsgegevens.nl
- **DE:** BfDI — https://www.bfdi.bund.de • IT-Sicherheitsgesetz 2.0 (in healthcare contexts) — https://www.bsi.bund.de
- **FR:** CNIL — https://www.cnil.fr • PGSSI-S — https://esante.gouv.fr/produits-services/pgssi-s
- **IT:** Garante per la protezione dei dati personali — https://www.garanteprivacy.it
- **ES:** AEPD — https://www.aepd.es

### Project governance

- Contributor Covenant — https://www.contributor-covenant.org
- Developer Certificate of Origin — https://developercertificate.org
- Apache 2.0 license — https://www.apache.org/licenses/LICENSE-2.0
- SPDX — https://spdx.dev
- Conventional Commits — https://www.conventionalcommits.org

---

**Document status:** Version 3.4, consolidated. Supersedes prior drafts.
**Repository:** `rubentalstra/ehrbase-ui`
**Owner:** [@rubentalstra](https://github.com/rubentalstra) (initial maintainer)
**Last versions audit:** May 26, 2026 — see version banner at top of document.
**Next review:** when TanStack Start ships v1.0 stable, when any pinned dependency has a HIGH/CRITICAL CVE, or when the legal/standards landscape shifts (EHDS milestones, NEN revisions).
