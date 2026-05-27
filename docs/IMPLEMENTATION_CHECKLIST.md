# `ehrbase-ui` — Implementation Checklist

> Tracker for the v1.0 build-out. Mark `[x]` when shipped, `[~]` when in-flight, blank when not started.
>
> Sourced from [`docs/architecture.md`](architecture.md) v3.4. When the arch doc changes, this checklist follows. Every line cites the §-section in the arch doc that defines the deliverable.

## Milestone 1 — Foundation (this PR)

Scaffolds every tooling rail the later milestones plug into. No PHI-touching code lands here.

- [x] **1A** Repo skeleton + ADR seeding + `.claude/` setup — governance docs (`docs/governance/`) owned by 1O
- [x] **1B** TanStack Start + Tailwind v4 scaffold — §4, §6
- [x] **1C** shadcn init + first component batch — §6
- [x] **1D** ESLint v10 flat config + `jsx-a11y-x` + `@eslint-react` + `react-hooks` v7 — §12.3
- [x] **1E** Vitest + `vitest-axe` + Button axe baseline test — §12.4, §24
- [x] **1F** Playwright + `@axe-core/playwright` + smoke E2E — §12.4, §24
- [x] **1G** Paraglide JS init + `en.json` + first `m.*` call — §11
- [x] **1H** Storybook 10.4.1 + `addon-a11y` (diverges from arch doc 9.x — ADR-0010, verification passed) — §17
- [x] **1I** Pino app logger, stdout only (audit write path lands in M2) — §13.1
- [x] **1J** `orval` config + vendored EHRbase OpenAPI stub — §15
- [x] **1K** Dockerfile + docker-compose dev stack (EHRbase + Keycloak + Valkey + Postgres) + realm import — §18, §5.6
- [x] **1L** CI/CD: `ci.yml`, `security.yml`, `codeql.yml`, `dependency-review.yml`, `release.yml`, `dependabot.yml`, CODEOWNERS, PR + issue templates — §20 (semver-tag pinning per ADR-0011)
- [x] **1M** Pre-commit hooks via `husky` + `lint-staged` + `commitlint`
- [ ] **1N** `.claude/` — sub-agents, `.mcp.json`, project notes
- [x] **1O** ADR-0001 (stack) + ADR-0010 (storybook upgrade) + ADR-0011 (action pinning) ratified; PR template + CODEOWNERS shipped in 1L

## Milestone 2 — Auth + BFF + audit write core (§5, §14.2–14.5)

Single PR. The audit **write path** is built here (not stubbed) because
break-glass (§5.6) and the BFF proxy depend on a real `logAudit`. ADR-0002,
0003, 0004, 0005 ratified; ADR-0012 (app DB stack) + ADR-0013 (audit DB
append-only) added.

- [x] **2A** Audit DB infra — `platform-db` rename + `audit` DB/roles init, Drizzle client, schema, migration (append-only trigger + grants), `db:*` scripts — §14; ADR-0012/0013
- [x] **2B** Audit write core — `AuditEvent` schema (derived from the table), `logAudit`, pseudonymization, hash chain, durable store, integrity verifier — §14.2–14.5
- [x] **2C** Valkey session store — read / write / destroy helpers + sliding TTL — §5.3
- [x] **2D** OIDC login (PKCE + state), callback (token exchange + session set + audited LOGIN), `/api/auth/logout` (Keycloak end-session) — §5.4
- [x] **2E** `requireAuth` + silent refresh + idle 15 min / absolute 12 h timeouts — §5.5, §5.10
- [x] **2F** `requireRole(...)` (clinician / admin / audit-reviewer / researcher) + break-glass hint on PHI denials — §5.6
- [x] **2G** Security-headers middleware (per-request CSP nonce + `strict-dynamic` + HSTS + COOP/COEP + no-store on authed routes) — §5.7
- [x] **2H** CSRF defense (Origin check + single-use per-form token) — §5.8
- [x] **2I** Rate limiting via `rate-limiter-flexible` against Valkey (full §5.9 table) — §5.9
- [x] **2J** BFF EHRbase proxy — authed pass-through, request classification, §5.9 limit, per-call audit, 404/403 conflation — §5, §10, §14.3
- [x] **2K** Break-glass emergency-access flow — 60-min grant, 3/lifetime ceiling, fully audited — §5.6
- [x] **2L** Minimal authed UI (`/_authed` + `/me`) + sign-in control — §5
- [x] **2M** Source maps hidden in production (verified + documented) — §5.11
- [x] **2N** Tests (unit + gated full-stack E2E with audit-chain assertion), ADR ratification, checklist rewrite, secrets/env/compose/gitleaks wiring

## Milestone 3 — UI shell + i18n + state (§6, §9, §10, §11, §12)

- [ ] App shell — sidebar (cookie state) + nav + theme toggle + `Command` palette
- [ ] `ThemeProvider` with `localStorage` + no-flash inline script
- [ ] Error boundaries per feature area
- [ ] TanStack Query global error → toast + correlation ID
- [ ] Public `/accessibility` statement page — §12.8
- [ ] `/me/access-log` scaffold (Art. 15 view; fed by the M4 governance milestone) — §14.8
- [ ] Skip-to-content link, visible focus rings, `scroll-margin-top` for sticky headers — §12.6
- [ ] Manual NVDA + VoiceOver test report under `docs/accessibility/` — §12.7

## Milestone 4 — Audit governance + retention (§14.6–14.13)

The audit **write path** (schema, `logAudit`, pseudonymization, hash chain,
warm-tier persistence, integrity verifier) shipped in M2. This milestone owns
the remaining **governance** chapter — distinct capabilities, each owned here:

- [ ] Cold storage tier: S3 Object Lock (WORM) + cross-region replication — §14.6
- [ ] Retention: 20-year WGBO enforcement + tagged purge job — §14.7
- [ ] Scheduled nightly hash-chain integrity job + DPO alerting (extends the M2 verifier) — §14.5
- [ ] DPIA template populated under `docs/compliance/` — §14.10
- [ ] DPA template populated — §14.1
- [ ] RoPA template populated — §14.1
- [ ] Breach response runbook — §14.9
- [ ] NEN-7513 sample-of-60 audit-review dashboard — §14.13
- [ ] Patient-facing Art.15 `/me/access-log` (scaffold from M3, fed here) — §14.8
- [ ] Audit-log integrity-check runbook

## Milestone 5 — openEHR forms (§7)

- [ ] Web-template fetch + cache — §2
- [ ] Zod schema generator from web template — §7 Validation
- [ ] `FieldRenderer` (rmType → shadcn map) — §7
- [ ] `ArrayFieldRenderer` (`useFieldArray` cardinality) — §7
- [ ] FLAT converter — §7
- [ ] `DV_MULTIMEDIA` upload + ClamAV sidecar — §7.x file uploads
- [ ] Optimistic concurrency (If-Match ETag) — §7.x concurrent edits
- [ ] Autosave drafts → encrypted Valkey, 24-hour TTL — §7.x autosave
- [ ] `CompositionViewer` (read-back) — §6

## Milestone 6 — AQL editor + data tables (§8)

- [ ] `@uiw/react-codemirror` wrapper with SQL highlighting
- [ ] AQL autocomplete schema (`EHR`, `COMPOSITION`, `OBSERVATION`, …)
- [ ] Stored-query persistence
- [ ] Result table via shadcn `data-table` + `@tanstack/react-table`
- [ ] Virtualized rows > 500 via `@tanstack/react-virtual`

## Milestone 7 — Observability (§13)

- [ ] OTel SDK bootstrap + sampling + PHI redaction layers — §13.2
- [ ] `pino-opentelemetry-transport` wiring — §13.1
- [ ] `/api/health` + `/api/ready` — §13.4
- [ ] OTel collector config in `docker-compose.yml`
- [ ] Tempo + Loki + Prometheus dev stack

## Milestone 8 — Hardening + release (§19, §21, §22, §25, §26)

- [ ] Secrets via env / Doppler — never committed — §19
- [ ] Backup + DR drill runbook — §21
- [ ] Performance budgets enforced in CI (Lighthouse) — §22
- [ ] Browser-support soft-block page — §23
- [ ] Quarterly DR drill scheduled — §21
- [ ] Manual NVDA + VoiceOver pre-tag pass — §12.7
- [ ] `/accessibility` conformance statement signed — §12.8
- [ ] DPIA legal sign-off — §14.10
- [ ] Penetration test
- [ ] Tag `v1.0.0`

---

## Conventions

- Strikethrough (`~~`) items are deferred deliberately (see §1 "Explicitly NOT in v1.0").
- When you tick a box, link the PR that completed it: `- [x] **1A** Repo skeleton ([#42](…))`.
- New items added during build-out land at the end of the relevant milestone with a date, e.g. `- [ ] (added 2026-06-10) …`.
