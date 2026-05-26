# `ehrbase-ui` — Implementation Checklist

> Tracker for the v1.0 build-out. Mark `[x]` when shipped, `[~]` when in-flight, blank when not started.
>
> Sourced from [`docs/architecture.md`](architecture.md) v3.4. When the arch doc changes, this checklist follows. Every line cites the §-section in the arch doc that defines the deliverable.

## Milestone 1 — Foundation (this PR)

Scaffolds every tooling rail the later milestones plug into. No PHI-touching code lands here.

- [x] **1A** Repo skeleton + ADR seeding + `.claude/` setup — governance docs (`docs/governance/`) deferred to 1O
- [x] **1B** TanStack Start + Tailwind v4 scaffold — §4, §6
- [x] **1C** shadcn init + first component batch — §6
- [x] **1D** ESLint v10 flat config + `jsx-a11y-x` + `@eslint-react` + `react-hooks` v7 — §12.3
- [x] **1E** Vitest + `vitest-axe` + Button axe baseline test — §12.4, §24
- [x] **1F** Playwright + `@axe-core/playwright` + smoke E2E — §12.4, §24
- [x] **1G** Paraglide JS init + `en.json` + first `m.*` call — §11
- [x] **1H** Storybook 10.4.1 + `addon-a11y` (diverges from arch doc 9.x — ADR-0010, verification passed) — §17
- [x] **1I** Pino app logger, stdout only (audit pipeline deferred to M4) — §13.1
- [x] **1J** `orval` config + vendored EHRbase OpenAPI stub — §15
- [x] **1K** Dockerfile + docker-compose dev stack (EHRbase + Keycloak + Valkey + Postgres) + realm import — §18, §5.6
- [x] **1L** CI/CD: `ci.yml`, `security.yml`, `codeql.yml`, `dependency-review.yml`, `release.yml`, `dependabot.yml`, CODEOWNERS, PR + issue templates — §20 (semver-tag pinning per ADR-0011)
- [x] **1M** Pre-commit hooks via `husky` + `lint-staged` + `commitlint`
- [ ] **1N** `.claude/` — sub-agents, `.mcp.json`, project notes
- [ ] **1O** ADR-0001 (stack) + ADR-0010 (storybook upgrade) ratified; PR template + CODEOWNERS

## Milestone 2 — Auth + BFF (§5)

- [ ] Keycloak realm bootstrap (the export already ships in 1K — this milestone wires the app to it)
- [ ] Valkey session store — read / write / destroy helpers — §5.3
- [ ] OIDC login route with PKCE + state — §5.4
- [ ] OIDC callback route — token exchange, session set — §5.4
- [ ] `/api/auth/logout` — Keycloak end-session — §5.4
- [ ] `requireAuth` middleware — §5.5
- [ ] `requireRole(...)` middleware (clinician / admin / audit-reviewer / researcher) — §5.6
- [ ] Break-glass emergency-access flow — §5.6
- [ ] Security-headers middleware (CSP nonce + `strict-dynamic` + HSTS + COOP / COEP) — §5.7
- [ ] CSRF defense (Origin check + per-form token for high-impact ops) — §5.8
- [ ] Rate limiting via `rate-limiter-flexible` against Valkey — §5.9
- [ ] Session timeouts: idle 15 min, absolute 12 h — §5.10
- [ ] Source maps hidden in production — §5.11

## Milestone 3 — UI shell + i18n + state (§6, §9, §10, §11, §12)

- [ ] App shell — sidebar (cookie state) + nav + theme toggle + `Command` palette
- [ ] `ThemeProvider` with `localStorage` + no-flash inline script
- [ ] Error boundaries per feature area
- [ ] TanStack Query global error → toast + correlation ID
- [ ] Public `/accessibility` statement page — §12.8
- [ ] `/me/access-log` scaffold (Art. 15 view, fed in M4) — §14.8
- [ ] Skip-to-content link, visible focus rings, `scroll-margin-top` for sticky headers — §12.6
- [ ] Manual NVDA + VoiceOver test report under `docs/accessibility/` — §12.7

## Milestone 4 — Audit log + DPIA scaffolding (§14)

- [ ] `AuditEvent` Zod schema — §14.2
- [ ] `logAudit()` helper (fire-and-forget Pino + Valkey hash chain) — §14.3
- [ ] Pseudonymization via HMAC-SHA256 + `AUDIT_PSEUDONYM_SECRET` — §14.4
- [ ] Hash chain integrity — §14.5
- [ ] Storage architecture: hot (Valkey head) + warm (Postgres) + cold (S3 Object Lock) — §14.6
- [ ] Retention: 20-year WGBO + tagged purge job — §14.7
- [ ] DPIA template populated under `docs/compliance/` — §14.10
- [ ] DPA template populated — §14.1
- [ ] RoPA template populated — §14.1
- [ ] Breach response runbook — §14.9
- [ ] Audit-review dashboard — §14.13
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
