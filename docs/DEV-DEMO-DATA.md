# Dev demo data + the `SEED_DEMO_DATA` convention

> Every UI surface must be **observable the moment you spin up the dev stack** — and
> exercised by e2e — without hand-entering data. We do that with flag-gated,
> idempotent **demo seed data**. This is a project convention (CLAUDE.md rule 14),
> not an afterthought: a surface you can't see populated is a surface you can't
> trust.

## The flag

`SEED_DEMO_DATA` (env, boolean):

- **`true`** — seed demo data. The dev `docker-compose.yml` + `.env.example` default
  this to `true`.
- Anything else / unset — no-op.

**The flag is the single gate.** The seed runs only when `SEED_DEMO_DATA === 'true'`,
read at **runtime**. We deliberately do NOT also gate on `NODE_ENV`: the dev stack
runs the **production Nitro build**, which inlines `process.env.NODE_ENV` to a literal
at build time — so a `NODE_ENV !== 'production'` check would wrongly no-op the dev
stack. `SEED_DEMO_DATA` is a custom env var that is never inlined, so it reliably
reflects the deployment's intent. A production deployment **must leave it unset /
false** (same posture as the dev-only Keycloak demo users); the seed data is synthetic
(no real PHI) and idempotent regardless.

## How it runs

The seed is **in-process, idempotent, and lazy** — not a separate script or container
(the demographic REST surface is session-gated, so a token-minting script like
`seed:templates` can't reach it; seeding through the provider in-process is both
simpler and auth-free):

- `apps/web/src/server/demographic/demo-seed.server.ts` → `ensureDemoSeed()`.
- It's awaited by the patients-list entry points (`searchPatientsImpl`,
  `getProviderCapabilitiesImpl`), so the **first `/admin/patients` load** seeds the
  data and shows it immediately. Memoised per process; later requests are free.
- Idempotent: keyed on a marker MRN (`DEMO-0001`). A server restart or a second
  load finds the marker and skips.
- Seed creates run through the demographic provider with a **system actor**, so they
  are audited via the IHE ATNA `PostgresAuditSink` like any write.

### What's seeded today (M7)

Six varied demographic patients (NL names, mixed sex/DOB incl. a paediatric one,
addresses, contacts; one carries a valid test BSN, the rest opaque MRNs). The
**demographic** side only — a demo patient shows "No EHR linked / Provision EHR".
Linked EHRs + clinical compositions are not seeded here (EHR provisioning needs an
EHRbase token); the create-patient flow + e2e exercise auto-provisioning, and later
milestones extend the seed with clinical demo data behind the same flag.

> Templates have their own dev seed — `pnpm seed:templates` (`scripts/dev/seed-templates.sh`).
> That one _can_ use a token-minting script because EHRbase is bearer-gated.

## The convention — extend the seed when you add a surface

When you build a new UI surface (a milestone screen, a new admin tool, a clinical
flow), **add demo seed data for it behind `SEED_DEMO_DATA`** in the same PR:

1. Add records to the relevant seed module (or a new `*-demo-seed.server.ts` for a
   new domain), keyed on a stable marker so it stays idempotent.
2. Trigger it from that surface's read entry point (await a memoised
   `ensureXDemoSeed()`), or extend `ensureDemoSeed()`.
3. Keep the two guards (`SEED_DEMO_DATA` + non-prod).
4. Make the e2e for the surface assert against the seeded data where useful.

The `clinical-ui-reviewer` sub-agent checks that a new clinical/admin surface ships
demo seed data.

## Resetting

Demo data lives in the normal dev databases. To re-seed from scratch, drop the dev
volumes (`docker compose down -v`) and bring the stack back up — first-boot DB init

- the lazy seed repopulate everything. (Seeded patients are also normal records:
  you can deactivate/merge them through the UI.)
