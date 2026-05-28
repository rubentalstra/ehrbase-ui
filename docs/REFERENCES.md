# `ehrbase-ui` — Reference Index

Single place to look up every external document, spec, registry entry, and tool the [architecture](architecture.md) cites. Also tracks the version-drift watch list against the verified-version table.

Re-verify the version block on every revision of `architecture.md` (§ "Version-drift discipline"). The lockfile (`pnpm-lock.yaml`) and the Dockerfile are the source of truth for what's actually installed — this page is a snapshot of authoritative upstream sources on the date stamped below.

---

## Verified version table (re-fetched 2026-05-26)

Each entry was fetched against the npm registry, Docker Hub, or the vendor's release page on the date above. Versions in **bold** are the value pinned in `package.json` / `Dockerfile` / `docker-compose.yml`.

### Runtime & package manager

| Tool          | Verified                                   | Pinned                                                               | Source                                           |
| ------------- | ------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------ |
| Node.js       | 24.16.0 (LTS Krypton, released 2026-05-21) | **24.16.0**                                                          | https://nodejs.org/en/about/previous-releases    |
| pnpm          | 11.3.0                                     | **11.3.0**                                                           | https://registry.npmjs.org/pnpm/latest           |
| Docker engine | 29.4.3                                     | **≥ 29.0** (for containerd default image store + CVE-2026-32288 fix) | https://docs.docker.com/engine/release-notes/29/ |

### Framework

| Package                  | Verified                                      | Pinned       | Source                                                   |
| ------------------------ | --------------------------------------------- | ------------ | -------------------------------------------------------- |
| `@tanstack/react-start`  | 1.168.13 (post-CVE-2026-45321 cleanup)        | **1.168.13** | https://registry.npmjs.org/@tanstack/react-start/latest  |
| `@tanstack/react-router` | 1.170.8                                       | **1.170.8**  | https://registry.npmjs.org/@tanstack/react-router/latest |
| `@tanstack/react-query`  | 5.100.14                                      | **5.100.14** | https://registry.npmjs.org/@tanstack/react-query/latest  |
| `react` / `react-dom`    | 19.2.6                                        | **19.2.6**   | https://registry.npmjs.org/react/latest                  |
| `vite`                   | 7.3.3 (v7 line — v8 deliberately not adopted) | **7.3.3**    | https://registry.npmjs.org/vite                          |
| `typescript`             | 6.0.3                                         | **6.0.3**    | https://registry.npmjs.org/typescript/latest             |

### UI & styling

| Package                 | Verified | Pinned                                               | Source                                                  |
| ----------------------- | -------- | ---------------------------------------------------- | ------------------------------------------------------- |
| `tailwindcss`           | 4.3.0    | **4.3.0**                                            | https://registry.npmjs.org/tailwindcss/latest           |
| shadcn/ui registry      | —        | latest at install time, components copied in via CLI | https://ui.shadcn.com                                   |
| `@uiw/react-codemirror` | 4.25.10  | **4.25.10**                                          | https://registry.npmjs.org/@uiw/react-codemirror/latest |
| `@codemirror/lang-sql`  | 6.10.0   | **6.10.0**                                           | https://registry.npmjs.org/@codemirror/lang-sql/latest  |

### Forms / validation

| Package               | Verified | Pinned     | Source                                                |
| --------------------- | -------- | ---------- | ----------------------------------------------------- |
| `zod`                 | 4.4.3    | **4.4.3**  | https://registry.npmjs.org/zod/latest                 |
| `react-hook-form`     | 7.76.1   | **7.76.1** | https://registry.npmjs.org/react-hook-form/latest     |
| `@hookform/resolvers` | 5.4.0    | **5.4.0**  | https://registry.npmjs.org/@hookform/resolvers/latest |

### i18n

| Package                | Verified | Pinned     | Source                                                 |
| ---------------------- | -------- | ---------- | ------------------------------------------------------ |
| `@inlang/paraglide-js` | 2.18.1   | **2.18.1** | https://registry.npmjs.org/@inlang/paraglide-js/latest |

### Auth, sessions, observability, data

| Package                   | Verified | Pinned      | Source                                                    |
| ------------------------- | -------- | ----------- | --------------------------------------------------------- |
| `arctic`                  | 3.7.0    | **3.7.0**   | https://registry.npmjs.org/arctic/latest                  |
| `ioredis`                 | 5.11.0   | **5.11.0**  | https://registry.npmjs.org/ioredis/latest                 |
| `pino`                    | 10.3.1   | **10.3.1**  | https://registry.npmjs.org/pino/latest                    |
| `@opentelemetry/sdk-node` | 0.218.0  | **0.218.0** | https://registry.npmjs.org/@opentelemetry/sdk-node/latest |

### Linting

| Package                       | Verified | Pinned     | Source                                                        |
| ----------------------------- | -------- | ---------- | ------------------------------------------------------------- |
| `eslint`                      | 10.4.0   | **10.4.0** | https://registry.npmjs.org/eslint/latest                      |
| `typescript-eslint`           | 8.60.0   | **8.60.0** | https://registry.npmjs.org/typescript-eslint/latest           |
| `@eslint-react/eslint-plugin` | 5.8.5    | **5.8.5**  | https://registry.npmjs.org/@eslint-react/eslint-plugin/latest |
| `eslint-plugin-react-hooks`   | 7.1.1    | **7.1.1**  | https://registry.npmjs.org/eslint-plugin-react-hooks/latest   |
| `eslint-plugin-jsx-a11y-x`    | 0.2.0    | **0.2.0**  | https://registry.npmjs.org/eslint-plugin-jsx-a11y-x/latest    |

### Testing

| Package                | Verified | Pinned     | Source                                                 |
| ---------------------- | -------- | ---------- | ------------------------------------------------------ |
| `vitest`               | 4.1.7    | **4.1.7**  | https://registry.npmjs.org/vitest/latest               |
| `vitest-axe`           | 0.1.0    | **0.1.0**  | https://registry.npmjs.org/vitest-axe/latest           |
| `axe-core`             | 4.11.4   | **4.11.4** | https://registry.npmjs.org/axe-core/latest             |
| `@axe-core/playwright` | 4.11.3   | **4.11.3** | https://registry.npmjs.org/@axe-core/playwright/latest |
| `@playwright/test`     | 1.60.0   | **1.60.0** | https://registry.npmjs.org/@playwright/test/latest     |

### Component library / docs

| Package     | Verified | Pinned                                                                                                        | Source                                      |
| ----------- | -------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `storybook` | 10.4.1   | **10.4.1** (diverges from arch doc §17 which names 9.x — see [ADR-0010](adr/0010-storybook-major-upgrade.md)) | https://registry.npmjs.org/storybook/latest |

### API generation

| Package | Verified | Pinned     | Source                                  |
| ------- | -------- | ---------- | --------------------------------------- |
| `orval` | 8.12.3   | **8.12.3** | https://registry.npmjs.org/orval/latest |

### Backend (proxied) & infrastructure

| Service    | Verified                                                | Pinned                                  | Source                                      |
| ---------- | ------------------------------------------------------- | --------------------------------------- | ------------------------------------------- |
| EHRbase    | 2.31.0 (Apr 2026, Java 25)                              | **2.31.0**                              | https://github.com/ehrbase/ehrbase/releases |
| Keycloak   | 26.6.2 (CVE-2026-37981 PII-enumeration fix)             | **≥ 26.6.2**                            | https://www.keycloak.org/downloads          |
| Valkey     | 9.1.0 (three use-after-free CVE fixes)                  | **≥ 9.1.0**                             | https://hub.docker.com/r/valkey/valkey/tags |
| PostgreSQL | 18.4 (May 14, 2026)                                     | **18.4**                                | https://www.postgresql.org/docs/release/    |
| SeaweedFS  | 4.29 (May 26, 2026) — dev cold-store default (ADR-0027) | **see image tag in docker-compose.yml** | https://github.com/seaweedfs/seaweedfs      |

### Audit cold-store dependencies (M4 — ADR-0027)

| Package                | Verified | Pinned       | Source                                                 |
| ---------------------- | -------- | ------------ | ------------------------------------------------------ |
| `@aws-sdk/client-s3`   | 3.1054.0 | **3.1054.0** | https://registry.npmjs.org/@aws-sdk/client-s3/latest   |
| `@aws-sdk/lib-storage` | 3.1054.0 | **3.1054.0** | https://registry.npmjs.org/@aws-sdk/lib-storage/latest |

---

## Drift watch list

Items that have moved since the architecture doc was last touched (2026-05-26) or that we have deliberately pinned away from the doc's value.

| Item      | Arch doc says  | Pinned to | Reason                                                                                                                             |
| --------- | -------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Node.js   | 24.15.0        | 24.16.0   | Newer LTS patch (released 2026-05-21).                                                                                             |
| Storybook | 9.x            | 10.4.1    | User-decided to take latest at scaffold time. Tracked in ADR-0010. Reversal path: fall back to 9.x if Vite 7 plugin compat breaks. |
| Vite      | 7.3.x for v1.0 | 7.3.3     | v8.0.14 stable on npm; intentionally NOT adopted, blocked by TanStack/router#7436 + #7091. Watch for resolution.                   |

---

## Architecture doc § → external link map

The architecture doc lists ~150 external URLs in §27. The full set is replicated here, grouped by concern, so that contributors can look up canonical sources without trawling §27.

### Runtime & package manager

- Node.js — https://nodejs.org/
- Node.js release schedule — https://nodejs.org/en/about/previous-releases
- pnpm — https://pnpm.io/
- pnpm `minimumReleaseAge` (supply-chain defense) — https://pnpm.io/settings#minimumreleaseage

### Framework & build

- TanStack Start — https://tanstack.com/start/latest
- TanStack Start server functions — https://tanstack.com/start/latest/docs/framework/react/guide/server-functions
- TanStack Start authentication guide — https://tanstack.com/start/latest/docs/framework/react/guide/authentication
- TanStack Start selective SSR — https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr
- TanStack Router — https://tanstack.com/router/latest
- TanStack Query — https://tanstack.com/query/latest
- TanStack Table — https://tanstack.com/table/latest
- TanStack May 2026 supply-chain incident (CVE-2026-45321) — https://security.snyk.io/vuln/SNYK-JS-TANSTACKREACTSTARTCLIENT-16640209
- React 19 release notes — https://react.dev/blog/2024/12/05/react-19
- Vite — https://vitejs.dev/
- Vite 8.0 announcement (Mar 12, 2026) — https://vite.dev/blog/announcing-vite8
- Vite 8 migration guide — https://vite.dev/guide/migration
- Vite release policy — https://vite.dev/releases
- Rolldown — https://rolldown.rs/
- TanStack/router#7436 (Vite 8 breaks CSS/HMR in Start) — https://github.com/TanStack/router/issues/7436
- TanStack/router#7091 (Vite 8 slow cold start in Start SPA) — https://github.com/TanStack/router/issues/7091
- Vitest 4.1 release notes — https://vitest.dev/blog/vitest-4-1

### UI / styling

- shadcn/ui — https://ui.shadcn.com
- shadcn/ui TanStack Start setup — https://ui.shadcn.com/docs/installation/tanstack
- shadcn/ui changelog — https://ui.shadcn.com/docs/changelog
- Tailwind CSS — https://tailwindcss.com
- Tailwind CSS v4.3 release — https://tailwindcss.com/blog/tailwindcss-v4-3
- Radix UI — https://www.radix-ui.com

### Forms, validation, code editor

- react-hook-form — https://react-hook-form.com
- @hookform/resolvers — https://github.com/react-hook-form/resolvers
- Zod v4 — https://zod.dev
- @uiw/react-codemirror — https://github.com/uiwjs/react-codemirror
- @codemirror/lang-sql — https://www.npmjs.com/package/@codemirror/lang-sql

### i18n

- Paraglide JS — https://github.com/opral/paraglide-js
- Paraglide JS docs — https://inlang.com/m/gerre34r/library-inlang-paraglideJs
- Paraglide TanStack Router guide — https://inlang.com/m/gerre34r/library-inlang-paraglideJs/tanstack-router
- TanStack Router i18n guide — https://tanstack.com/router/latest/docs/guide/internationalization-i18n
- TanStack example `i18n-paraglide` — https://github.com/TanStack/router/tree/main/examples/react/i18n-paraglide
- TanStack example `start-i18n-paraglide` — https://github.com/TanStack/router/tree/main/examples/react/start-i18n-paraglide
- Inlang Sherlock (VS Code extension) — https://inlang.com/m/r7kp499g/app-inlang-ideExtension
- Inlang Fink (translation editor) — https://inlang.com/m/tdozzpar/app-inlang-finkLocalizationEditor

### Auth, sessions, data store

- Arctic — https://arcticjs.dev
- Keycloak — https://www.keycloak.org
- Keycloak 26.6 release notes — https://www.keycloak.org/2026/04/keycloak-2660-released
- Valkey — https://valkey.io
- Valkey downloads — https://valkey.io/download
- ioredis (works against Valkey unchanged) — https://github.com/redis/ioredis

### Database

- PostgreSQL — https://www.postgresql.org
- PostgreSQL release notes — https://www.postgresql.org/docs/release/
- PostgreSQL official Docker image — https://hub.docker.com/_/postgres

### Observability

- OpenTelemetry — https://opentelemetry.io
- OpenTelemetry status — https://opentelemetry.io/status
- OpenTelemetry JS SDK — https://opentelemetry.io/docs/languages/js/getting-started/nodejs/
- `@opentelemetry/sdk-node` — https://www.npmjs.com/package/@opentelemetry/sdk-node
- `@opentelemetry/auto-instrumentations-node` — https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node
- OTLP exporter configuration — https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/
- W3C Trace Context — https://www.w3.org/TR/trace-context/
- Semantic conventions — https://opentelemetry.io/docs/specs/semconv/
- OpenTelemetry Collector — https://opentelemetry.io/docs/collector/
- Grafana Tempo — https://grafana.com/oss/tempo/
- Grafana Loki — https://grafana.com/oss/loki/
- Prometheus — https://prometheus.io
- Pino — https://github.com/pinojs/pino
- Pino v10 breaking changes — https://github.com/pinojs/pino/issues/2317
- Pino releases — https://github.com/pinojs/pino/releases
- pino-opentelemetry-transport — https://github.com/pinojs/pino-opentelemetry-transport
- pino-http — https://github.com/pinojs/pino-http

### openEHR / EHRbase

- EHRbase — https://ehrbase.org
- EHRbase repo — https://github.com/ehrbase/ehrbase
- openEHR specifications — https://specifications.openehr.org
- AQL specification — https://specifications.openehr.org/releases/QUERY/latest/AQL.html
- openEHR Reference Model — https://specifications.openehr.org/releases/RM/latest/

### Accessibility (legal + tooling)

- European Accessibility Act (Directive EU 2019/882) — https://eur-lex.europa.eu/eli/dir/2019/882/oj
- EAA overview (European Commission) — https://ec.europa.eu/social/main.jsp?catId=1202
- EN 301 549 v3.2.1 — https://www.etsi.org/deliver/etsi_en/301500_301599/301549/03.02.01_60/en_301549v030201p.pdf
- WCAG 2.1 — https://www.w3.org/TR/WCAG21/
- WCAG 2.2 — https://www.w3.org/TR/WCAG22/
- WCAG quick reference — https://www.w3.org/WAI/WCAG21/quickref/
- ARIA Authoring Practices Guide — https://www.w3.org/WAI/ARIA/apg/
- axe-core — https://github.com/dequelabs/axe-core
- axe-core rule tags (`EN-301-549`) — https://github.com/dequelabs/axe-core/blob/develop/doc/API.md#options-parameter
- `@axe-core/playwright` — https://www.npmjs.com/package/@axe-core/playwright
- `vitest-axe` — https://www.npmjs.com/package/vitest-axe
- NVDA — https://www.nvaccess.org

### ESLint v10 + plugins

- ESLint v10.0.0 release notes — https://eslint.org/blog/2026/02/eslint-v10.0.0-released/
- ESLint v10.4.0 release notes — https://eslint.org/blog/2026/05/eslint-v10.4.0-released/
- ESLint v10 migration guide — https://eslint.org/docs/latest/use/migrate-to-10.0.0
- ESLint version-support policy — https://eslint.org/version-support/
- typescript-eslint dependency versions — https://typescript-eslint.io/users/dependency-versions/
- typescript-eslint v8 announcement — https://typescript-eslint.io/blog/announcing-typescript-eslint-v8/
- `@eslint-react/eslint-plugin` — https://www.eslint-react.xyz/
- `eslint-plugin-react` ESLint 10 incompatibility (issue #3977) — https://github.com/jsx-eslint/eslint-plugin-react/issues/3977
- `eslint-plugin-react` ESLint 10 fix PR (blocked) — https://github.com/jsx-eslint/eslint-plugin-react/pull/3979
- `eslint-plugin-react-hooks` v10 support (PR #35720) — https://github.com/facebook/react/pull/35720
- `eslint-plugin-jsx-a11y-x` — https://www.npmjs.com/package/eslint-plugin-jsx-a11y-x
- `eslint-plugin-jsx-a11y` (canonical) — https://github.com/jsx-eslint/eslint-plugin-jsx-a11y

### Security hardening

- OWASP ASVS 5.0 — https://owasp.org/www-project-application-security-verification-standard/
- OWASP CSP Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html
- MDN CSP guide — https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP
- Google strict-CSP guide — https://csp.withgoogle.com/docs/strict-csp.html
- ClamAV documentation — https://docs.clamav.net
- `clamscan` Node.js client — https://www.npmjs.com/package/clamscan
- `rate-limiter-flexible` — https://github.com/animir/node-rate-limiter-flexible
- Storybook — https://storybook.js.org
- Storybook a11y addon — https://storybook.js.org/addons/@storybook/addon-a11y

### openEHR open standard — verified component versions (web-fetched 2026-05-28)

Component releases are pinned per the architecture-doc "Version-drift discipline" — re-verify at every revision of `architecture.md`, never by recollection.

| Component                                                                              | Release              | URL                                                                                     |
| -------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------- |
| BASE Model (architecture overview + foundational classes)                              | 1.2.0                | https://specifications.openehr.org/releases/BASE/Release-1.2.0                          |
| Reference Model (RM) — EHR IM + Demographic IM + Common + Data Types + Data Structures | 1.1.0                | https://specifications.openehr.org/releases/RM/Release-1.1.0                            |
| Archetype Model (AM / ADL2 / AOM2 / OPT)                                               | 2.3.0                | https://specifications.openehr.org/releases/AM/Release-2.3.0                            |
| Query (AQL)                                                                            | 1.1.0                | https://specifications.openehr.org/releases/QUERY/Release-1.1.0                         |
| Process (PROC — Task Planning, WORK_PLAN / TASK_PLAN / PLAN_ITEM)                      | 1.7.0                | https://specifications.openehr.org/releases/PROC/Release-1.7.0                          |
| Clinical Decision Support (CDS / GDL2)                                                 | 2.0.1                | https://specifications.openehr.org/releases/CDS/Release-2.0.1                           |
| Terminology (TERM)                                                                     | 3.0.0                | https://specifications.openehr.org/releases/TERM/Release-3.0.0                          |
| ITS-REST (REST API specification — the surface EHRbase exposes)                        | 1.0.3 (19 Dec 2022)  | https://specifications.openehr.org/releases/ITS-REST/Release-1.0.3                      |
| ITS-XML (XML serialisation of the RM)                                                  | 2.0.0                | https://specifications.openehr.org/releases/ITS-XML/Release-2.0.0                       |
| ITS-JSON (JSON serialisation)                                                          | development          | https://specifications.openehr.org/releases/ITS-JSON/development                        |
| openEHR base architecture overview (the EHR/Demographic separation source)             | —                    | https://specifications.openehr.org/releases/BASE/development/architecture_overview.html |
| Clinical Knowledge Manager (archetype + template catalogue)                            | live                 | https://ckm.openehr.org/ckm/                                                            |
| openEHR Foundation                                                                     | —                    | https://openehr.org                                                                     |
| EHRbase (open-source CDR; implements EHR IM only — see ADR-0023)                       | 2.31.0 (28 Apr 2026) | https://github.com/ehrbase/ehrbase                                                      |
| EHRbase docs                                                                           | —                    | https://docs.ehrbase.org                                                                |

### Terminology infrastructure

- Snowstorm (SNOMED International open-source terminology server, our v1.0 default — ADR-0022) — https://github.com/IHTSDO/snowstorm
- SNOMED International — https://www.snomed.org
- LOINC — https://loinc.org
- ATC (WHO Anatomical Therapeutic Chemical classification) — https://www.whocc.no/atc_ddd_index/

### Compliance — EU baseline

- GDPR — https://eur-lex.europa.eu/eli/reg/2016/679/oj
- GDPR (Art. 9, 30, 32, 33-34, 35) — https://gdpr-info.eu
- EHDS Regulation (EU) 2025/327 — https://eur-lex.europa.eu/eli/reg/2025/327/oj
- ISO 27799 (Health informatics — Information security management) — https://www.iso.org/standard/62777.html
- IHE ATNA (Audit Trail and Node Authentication) — https://profiles.ihe.net/ITI/TF/Volume1/ch-9.html
- IHE BPPC (Basic Patient Privacy Consents — break-glass pattern reference) — https://profiles.ihe.net/ITI/TF/Volume1/ch-19.html
- ISO/TS 22600 (Privilege management and access control — break-glass reference) — https://www.iso.org/standard/62653.html
- EDPB (European Data Protection Board) — https://edpb.europa.eu

### Compliance — national overlay (examples; each deployment configures its own)

- **NL:** NEN 7513:2024 — https://www.nen.nl/en/nen-7513-2024-nl-329182 • Wabvpz — https://wetten.overheid.nl/BWBR0019769 • Besluit elektronische gegevensverwerking door zorgaanbieders — https://wetten.overheid.nl/BWBR0040076 • WGBO (Boek 7 BW, art. 446-468) — https://wetten.overheid.nl/BWBR0005290 • Autoriteit Persoonsgegevens (AP) — https://autoriteitpersoonsgegevens.nl
- **DE:** BfDI — https://www.bfdi.bund.de • IT-Sicherheitsgesetz 2.0 — https://www.bsi.bund.de
- **FR:** CNIL — https://www.cnil.fr • PGSSI-S — https://esante.gouv.fr/produits-services/pgssi-s
- **IT:** Garante per la protezione dei dati personali — https://www.garanteprivacy.it
- **ES:** AEPD — https://www.aepd.es

### Project governance

- Contributor Covenant — https://www.contributor-covenant.org
- Developer Certificate of Origin — https://developercertificate.org
- Apache 2.0 license — https://www.apache.org/licenses/LICENSE-2.0
- SPDX — https://spdx.dev
- Conventional Commits — https://www.conventionalcommits.org
