# ADR-0012 — App DB stack: Drizzle ORM v1 (RC) + postgres.js + built-in zod

- **Status:** Accepted
- **Date:** 2026-05-27
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

Milestone 2 introduces the app's **first owned database** — the `audit`
database (§14, ADR-0013). It needs a typed access layer + a migration tool.
This ADR records the stack chosen, which every future app-owned DB reuses.

## Decision

- **Drizzle ORM `1.0.0-rc.3`** + **drizzle-kit `1.0.0-rc.3`** (migrations,
  dev dep) + **postgres.js `3.4.9`** (driver).
- Zod validators are derived from the Drizzle table via the **built-in
  `drizzle-orm/zod`** export (targets `zod/v4`, matching our pinned Zod 4.x).
  The standalone `drizzle-zod` package is **deprecated as of
  `drizzle-orm@1.0.0-beta.15`** and is NOT a dependency. Deriving the schema
  from the table keeps the table the single source of truth — schema and
  storage cannot drift.
- Runtime uses the least-privilege `audit_writer` connection (`AUDIT_DB_URL`);
  migrations use `audit_owner` (`AUDIT_DB_OWNER_URL`). Both are standalone env
  vars so production can point the audit DB at a physically separate managed
  Postgres with no code change.

## Risks accepted

**Drizzle v1 is RC, not GA** (maintainer-approved). We pin `1.0.0-rc.3`
exactly. The only consumer in M2 is the audit store, whose correctness is also
guarded by the hash chain (§14.5) and the append-only DB constraints
(ADR-0013), so an ORM-layer regression cannot silently corrupt history.
pnpm's `minimumReleaseAge: 1440` may block an RC published <24 h before
install — wait it out, never disable the gate. Watch for GA `1.0.0` and bump;
prefer a newer clean `1.0.0-rc.N` or GA if one exists at implementation time.

## Consequences

**Positive:** end-to-end type safety from column to Zod to TypeScript; one
migration tool; a clean physical-isolation promotion path for prod.
**Negative:** a pre-GA dependency on the audit hot path until Drizzle v1 ships
GA. Tracked for the bump.
