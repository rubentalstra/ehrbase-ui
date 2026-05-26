# ADR-0001 — Stack choice

- **Status:** Accepted
- **Date:** 2026-05-26
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

EHRbase is a mature Apache-2.0 openEHR server, but no comprehensive, modern, open-source UI exists. Existing options are either commercial (Better Platform), aging demos, or framework-specific component libraries. This project fills the gap.

The chosen deployment context (self-hosted clinical environments inside the EU, initial target Netherlands) imposes GDPR + NEN 7510/7512/7513 + WGBO + EHDS constraints. Security and audit logging are first-class. Versions need to be pinned exactly because supply-chain attacks have already hit our dependency tree (CVE-2026-45321, May 2026 TanStack compromise).

## Decision

Adopt the stack listed in `docs/architecture.md` §1 and verified in `docs/REFERENCES.md`:

- Node 24.16.0 LTS, pnpm 11.3.0 (with `minimumReleaseAge: 1440`)
- TanStack Start 1.168.13 + TanStack Router 1.170.8 + TanStack Query 5.100.14
- React 19.2.6, Vite 7.3.3 (NOT v8 — blocked by upstream issues)
- Tailwind 4.3.0, shadcn/ui copied via CLI (no runtime dep)
- Paraglide 2.18.1 for i18n (compile-time, TanStack-recommended)
- ESLint 10.4.0 with `eslint-plugin-jsx-a11y-x`, `@eslint-react/eslint-plugin`, `eslint-plugin-react-hooks` 7.x
- Vitest 4.1.7, Playwright 1.60.0, axe-core 4.11.4
- Storybook 10.4.1 (see ADR-0010 for divergence from arch doc 9.x)
- Pino 10.3.1, OpenTelemetry SDK 0.218.0
- Keycloak ≥ 26.6.2 (CVE floor), Valkey ≥ 9.1.0, PostgreSQL 18.4
- EHRbase 2.31.0 pinned exact, never `:latest`

Every dependency is pinned exactly (no `^`, no `~`). GitHub Actions are SHA-pinned. Docker images use exact tags.

## Rationale

See `docs/architecture.md` §1 "Stack at a glance" and §17 "PNPM, Tooling & Conventions" for the full reasoning per choice. Key points:

- **TanStack Start over Next.js / Remix:** end-to-end type-safe routing, explicit server boundary via `createServerFn`, Vite under the hood, no vendor lock-in.
- **shadcn/ui over a runtime component library:** components copied into the repo are auditable line-by-line and free of runtime dependency risk.
- **Paraglide over react-i18next:** compile-time tree-shaking shrinks bundles, type-safe message calls catch typos at compile time, TanStack themselves recommend it.
- **Valkey over Redis:** BSD-licensed fork of pre-relicensed Redis. Apache-2.0 codebase cannot inherit AGPL upstream.
- **PostgreSQL 18 over 16:** async I/O for performance; greenfield project so starting on the latest pays off.
- **ESLint 10 + non-canonical plugin fork:** canonical `eslint-plugin-jsx-a11y` and `eslint-plugin-react` have not yet released ESLint-10-compatible versions. The `-x` fork of jsx-a11y and `@eslint-react` are the actively-maintained alternatives.

## Consequences

**Positive:**
- Foundation rails are in place for every later milestone (auth, audit, forms, AQL, observability) to plug into cleanly.
- Supply-chain posture is robust by default (pnpm 11 release-age delay, SHA-pinned actions, version-floor list for CVE-fixed deps).
- Type safety stretches across the entire stack — routes, server functions, queries, forms, i18n messages.

**Negative:**
- Several pinned packages are RC-quality (TanStack Start at v1.168, Storybook 10 just released). Upgrade work is non-zero each cycle.
- ESLint 10 plugin ecosystem is mid-transition; we're tracking forks until canonical packages catch up.
- The lockfile must be the source of truth — drift between `docs/REFERENCES.md` and `pnpm-lock.yaml` is possible and requires the version-drift discipline described in `docs/architecture.md` §1.

**Mitigations:**
- Dependabot daily on npm, weekly on actions/Docker (§20.8).
- CI fails the build if `package.json` and `pnpm-lock.yaml` drift (§20.3).
- Re-verify the version table at every revision of `docs/architecture.md` by web-fetch, never by recollection.

## Links

- [Architecture doc § 1](../architecture.md#1-executive-summary)
- [Verified version table](../REFERENCES.md#verified-version-table-re-fetched-2026-05-26)
