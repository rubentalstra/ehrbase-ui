# ADR-0030 — Monorepo structure (Turborepo + pnpm workspaces, per-openEHR-spec packages)

- **Status:** Accepted
- **Date:** 2026-05-29
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —
- **Amended by:** ADR-0035 (the cross-cutting platform packages `db-platform`, `audit`, `auth`, `observability`, `http-bff` were collapsed into `apps/web/src/server/*` — they had no consumer outside the app).

## Context

Architecture-doc reference: §0 (new), §17 (file layout). Through M1–M4 the repo was a single TanStack Start app under `src/`. From M5 onward every clinical milestone (M10–M18) writes into the same openEHR substrate (Reference Model types, FLAT/STRUCTURED/CANONICAL converters, web-template parser, optimistic-concurrency helpers, CONTRIBUTION header composer). Without per-spec packages each clinical surface would re-roll those primitives, fragmenting maintenance and making it impossible to swap concerns (e.g. ship the AQL package to a researcher tool without the whole web app).

Several TypeScript openEHR libraries exist in 2026 (`ehrtslib`, `medblocks-ui`, `@bpac/openehr-models`, `@mmt_d/mmt-openehr-types`) but none are production-grade for clinical software: ehrtslib is active but self-described "experimental" with no npm releases (6 stars, May 2026); medblocks-ui's last release is May 2023 (Lit + Shoelace web components — incompatible with our React + shadcn stack); the others are older or generated-types-only.

The TanStack Start pnpm-monorepo bug ([TanStack/router#6588](https://github.com/TanStack/router/issues/6588)) was closed via PR #7178 and the fix is in our pinned 1.168.13.

## Decision

**Adopt a Turborepo + pnpm-workspaces monorepo.** Per-openEHR-spec packages plus cross-cutting platform packages plus deployable apps.

Layout:

```
ehrbase-ui/
├── apps/web/                                   # TanStack Start app (current src/ moves here)
├── packages/
│   ├── openehr-base/                           # BASE 1.2.0
│   ├── openehr-rm/                             # RM 1.1.0 (EHR + Demographic + Data Types)
│   ├── openehr-am/                             # AM 2.3.0 (ADL2 / AOM2 / OPT)
│   ├── openehr-aql/                            # AQL 1.1.0
│   ├── openehr-proc/                           # PROC 1.7.0 (Task Planning)
│   ├── openehr-cds/                            # CDS 2.0.1 (GDL2-aligned)
│   ├── openehr-term/                           # TERM 3.0.0 (terminology iface)
│   ├── openehr-its-rest/                       # ITS-REST 1.0.3 (EHRbase REST client)
│   ├── openehr-flat/                           # FLAT / simSDT converter
│   ├── openehr-web-template/                   # web-template parser + Zod generator
│   ├── demographic-core/                       # built-in adapter + provider interface (ADR-0031)
│   ├── demographic-adapter-fhir/               # FHIR R4 Patient adapter (ADR-0033)
│   ├── term-core/                              # terminology provider interface (ADR-0034)
│   ├── term-adapter-snowstorm/                 # default
│   ├── ui/                                     # shadcn primitives + openEHR field renderers
│   ├── audit/                                  # NEN-7513 logger + cold-store + integrity
│   ├── auth/                                   # better-auth wiring (ADR-0028)
│   ├── observability/                          # OTel SDK + Pino transport (M5)
│   ├── db-platform/                            # Drizzle schemas + clients (audit + auth + demographic)
│   ├── i18n/                                   # Paraglide setup
│   ├── http-bff/                               # BFF proxy helpers
│   ├── valkey/                                 # ioredis client wrapper
│   ├── config-tsconfig/                        # shared tsconfig bases
│   ├── config-eslint/                          # shared flat config
│   └── config-tailwind/                        # shared Tailwind v4 preset
├── turbo.json
├── pnpm-workspace.yaml
└── package.json                                # root: pnpm + turbo scripts only
```

**Package-name convention:** `@ehrbase-ui/<slug>` (private workspace packages; no npm publish). Workspace deps via `workspace:*`.

**Turbo task graph** (`turbo.json`): `build` (topological, cache `dist/**`), `typecheck` (cache `.tsbuildinfo`), `lint` (cache lint caches), `test` (deps on `^build`), `e2e` (deps on `^build`, cache Playwright report), `dev` (no caching).

**TypeScript project references** drive incremental builds: each package's `tsconfig.json` extends `@ehrbase-ui/config-tsconfig`; the root `tsconfig.json` references every package.

**Server-only suffix discipline** (`.server.ts`) and **server-function location** (`apps/web/src/server/functions/<feature>.functions.ts`) carry over verbatim from CLAUDE.md Inviolable rules 7 and 8.

## Consequences

**Positive.** (a) Per-openEHR-spec packages are reusable beyond v1.0 — the openEHR-aql package can power a standalone researcher tool, openehr-flat can be vendored into a partner integration without our entire BFF. (b) Each clinical milestone (M10–M18) lands code into the existing package layout — no per-milestone re-shuffle. (c) Turbo cache + parallel scheduling cuts CI wall-clock substantially as packages multiply. (d) Strong import boundaries — TS project references prevent accidental coupling (e.g. `packages/openehr-rm` cannot import from `packages/ui`).

**Negative.** (a) Phase 0 migration is a one-time large PR. Mitigated by: every file moves verbatim (no rewrites), strict mapping table in the plan, sub-agent gates run on every package boundary, full pre/post diff via `git log --follow`. (b) Cross-package refactors are more friction than cross-file refactors in a single src/. Mitigated by Turbo's `--filter` cascade. (c) Initial dev-loop cost slightly higher (first build cold). Mitigated by Turbo's local cache.

**Trade-off vs single-package layout.** Rejected. Every clinical milestone would re-roll primitives. The cost of splitting later (re-touching every surface) exceeds the cost of splitting now.

**Trade-off vs Nx.** Rejected. Nx is heavier and more opinionated; less common in the TanStack/shadcn ecosystem. Turborepo is the de-facto 2026 standard (Vercel, Next.js, TanStack themselves use it).

**Trade-off vs pnpm-workspaces alone.** Rejected. We lose caching + parallel scheduling. For 20+ packages the wall-clock penalty in CI is real.

**Trade-off vs depending on `ehrtslib`.** Rejected for v1.0 — see ADR-0032 for the full openEHR types generation strategy.

## Verification

- `pnpm install` at repo root succeeds; workspace graph contains every package
- `pnpm turbo run build typecheck lint test` green across the graph; second run is cache-hit-warm
- `pnpm turbo run dev --filter web` starts the app exactly as before the migration; `/me` page renders identically
- `pnpm turbo run e2e --filter web` Playwright suite passes the pre-migration baseline byte-for-byte
- `git diff --stat main` shows expected file moves only (no unexpected logic changes)
- Pre-commit hooks (husky + lint-staged + commitlint) fire correctly from root
- `@ehrbase-ui/openehr-rm` cannot import from `@ehrbase-ui/ui` (TS project-references error)
