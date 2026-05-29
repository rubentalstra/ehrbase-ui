# ADR-0035 — App-server code lives in `apps/web/src/server`, not as packages

- **Status:** Accepted
- **Date:** 2026-05-29
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —
- **Amends:** ADR-0030 (monorepo structure) — narrows the "cross-cutting platform packages" set.

## Context

Architecture-doc reference: §17 (file layout), §18 (Docker).

ADR-0030 extracted a set of cross-cutting concerns into workspace packages, including
`@ehrbase-ui/db-platform`, `@ehrbase-ui/audit`, `@ehrbase-ui/auth`, `@ehrbase-ui/observability`,
and `@ehrbase-ui/http-bff`. In practice these five are **not standalone libraries** — they are the
web app's own server implementation (persistence, NEN-7513 audit, Better Auth wiring, OTel/health,
BFF helpers). There is no second consumer:

- A dependency-graph audit (May 2026) found the only edges among the five are **internal to the set**
  (plus `@ehrbase-ui/valkey`, which stays a package). **No other workspace package imports any of the
  five.** So collapsing them into `apps/web` introduces no illegal package→app dependency.
- The drizzle-kit configs already lived in `apps/web` while the schema lived in `db-platform`,
  forcing `../../packages/...` cross-package paths — a smell that the boundary was in the wrong place.
- The per-package ceremony (a `package.json`, `tsconfig.json`, `workspace:*` wiring each) bought
  cache granularity and boundary lint that are marginal for a single TanStack Start + Nitro
  deployable where all five run inside the one Node process. The retention / audit-integrity jobs run
  as Nitro scheduled tasks **inside** the web app (ADR-0026), so there is no separate worker
  deployable that would need them independently.

The genuinely-separate code keeps its packages, matching the rule of thumb "package it only if it
isn't the web app": the `openehr-*` spec libraries (ADR-0032), `demographic-*` (ADR-0031), `term-*`
(ADR-0034), plus shared utilities `valkey`, `i18n`, `ui`, and `config-*`.

## Decision

**Move the five app-server packages into `apps/web/src/server/*`** (and the one browser-side Better
Auth client into `apps/web/src/lib/`):

| Was (package)                       | Now (under `apps/web/src/`)                  |
| ----------------------------------- | -------------------------------------------- |
| `@ehrbase-ui/db-platform`           | `server/db/` (schema + clients + migrations) |
| `@ehrbase-ui/audit`                 | `server/audit/`                              |
| `@ehrbase-ui/auth` (server)         | `server/auth/`                               |
| `@ehrbase-ui/auth/client` (browser) | `lib/auth-client.ts`                         |
| `@ehrbase-ui/observability`         | `server/observability/`                      |
| `@ehrbase-ui/http-bff`              | `server/bff/`                                |

Imports use the existing `@/*` alias (`@/server/...`, `@/lib/...`). Server-only modules follow the
TanStack Start convention — the `.server.ts` suffix + `createServerOnlyFn` (CLAUDE.md Inviolable
rule 7) — not the `server-only` npm package. The drizzle-kit configs move to `apps/web`
(`drizzle.audit.config.ts`, `drizzle.auth.config.ts`) pointing at `src/server/db/*`, with a single
`db:generate` / `db:migrate` script per verb (each runs both DBs). No change to the audit/auth
least-privilege role model, the append-only enforcement, or dev/prod parity — only file location.

The workspace drops from 22 packages to 17.

## Consequences

- **Positive:** one mental model for app-server code; configs co-located with schema; fewer
  `package.json`/`tsconfig.json` to maintain; no cross-package `../../` paths.
- **Negative:** these concerns no longer have a hard, lint-enforced module boundary — discipline is by
  folder (`server/`) + `.server.ts` rather than by package. If a future milestone needs one of them in
  a _separate_ deployable (e.g. a standalone retention worker), it would be re-extracted then.
- **Neutral:** `@ehrbase-ui/valkey` remains a package (5 consumers); the `openehr-*` / `demographic-*`
  / `term-*` / `i18n` / `ui` / `config-*` packages are unchanged.
