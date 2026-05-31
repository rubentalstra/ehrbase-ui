# Project-level rules for Claude sessions on `ehrbase-ui`

Authoritative spec: [`docs/architecture.md`](./docs/architecture.md) (v3.4). When in doubt, check the §-numbered section. This file is the cheat sheet, not the source of truth.

Progress tracker: [`docs/IMPLEMENTATION_CHECKLIST.md`](./docs/IMPLEMENTATION_CHECKLIST.md). External links: [`docs/REFERENCES.md`](./docs/REFERENCES.md).

> **Core-refocus (2026-05-30) + audit re-grounding (2026-05-31).** The 2026-05-30 core-refocus
> removed the _bespoke_ governance layer (the NEN-7513 `logAudit` hash-chain subsystem, the
> OTel/Tempo/Loki/Prometheus/Grafana observability stack, ClamAV, compliance docs/runbooks) to focus
> the build on the openEHR + EHRbase UI core. The **2026-05-31 re-plan re-grounds audit on the
> standard**: research established that EHRbase **2.31.0 has NO native ATNA and NO ABAC** (both
> existed in 1.x and were removed in the 1.x→2.x rewrite; HIP's are separate commercial plugins —
> ADR-0043). So access auditing + access control are the application's job, and we build them **in
> open source**: openEHR `CONTRIBUTION`/`AUDIT_DETAILS`/`ATTESTATION` (write lineage, native) +
> **IHE ATNA access events emitted from the BFF** → a Postgres `audit` schema, as the foundational
> milestone **M9** (ADR-0041). **This un-defers rules 1, 2, and the audit half of 11.** Only the
> _hardening_ on top stays deferred (hash-chain tamper-evidence, retention, cold-store, observability,
> ClamAV, compliance docs — see "Deferred (post-core)"). The clinical build is **re-sequenced
> spine-first** (ADR-0042) and the role model expanded to **7 personas** — `physician` / `nurse` /
> `lab-technician` / `pharmacist` / `admin` / `audit-reviewer` / `researcher` (the four clinical ones
> inherit the `clinician` umbrella; ADR-0040). Live roadmap: `docs/IMPLEMENTATION_CHECKLIST.md`.

## Inviolable rules (don't compromise these — clinical software)

1. **Audit before anything.** Every PHI-touching server function / route loader emits an **IHE ATNA access event** via the BFF `auditAccess(...)` helper **before it returns** — on success _and_ failure paths — persisted to the Postgres `audit` schema. EHRbase 2.x has no native read-access audit; this is ours (ADR-0041, built in M9). The `audit-compliance-reviewer` sub-agent enforces.
2. **PHI never in error messages, logs, or audit free-text.** Conflate 404/403 where the existence of a record is itself sensitive; never put a name / DOB / national ID into an error response, a log line, or an ATNA message's free-text fields (§10, ADR-0041). Enforced gate again as of the 2026-05-31 re-plan.
3. **No `as` casts** — ESLint blocks them. Use Zod parse or type guards (§17 Conventions).
4. **No hard-coded UI strings.** Every user-visible string goes through a Paraglide message function: `m.<key>()` rather than `"Patient records"`. The TypeScript compiler enforces (§11.5, §11.7).
5. **Pin every dependency exactly** in `package.json`. No `^`, no `~`. Same for GitHub Actions (SHA-pin, not tag) and Docker images (no `:latest`) (§17, §20.1, §5.12).
6. **shadcn/ui registry first.** When a UI primitive is needed, check the official shadcn/ui registry before writing custom code (§6). Custom UI primitives are reserved for openEHR-specific concerns (dynamic form field renderer, composition tree viewer, AQL editor wrapper, vitals charts).
   6a. **TanStack Table for all data tables.** Every data table — patient lists, AQL results, audit logs, orders, meds, anything rendering rows of records — uses `@tanstack/react-table` via the shared `DataTable` primitive (`apps/web/src/components/ui/data-table.tsx`). Sorting / filtering / pagination come from its built-ins; virtualize >500 rows via `@tanstack/react-virtual` (pass `virtualize`). Don't hand-roll `<Table>`-markup tables (§8, ADR-0038). Exception: computed diffs / openEHR-specific grids (e.g. `conflict-dialog.tsx`, the vitals flowsheet).
7. **`.server.ts` suffix** for files that must never reach the client bundle (§17 Conventions).
8. **Server functions live in `apps/web/src/server/functions/<feature>.functions.ts`** (§17 Conventions; ADR-0030 monorepo layout).
9. **No AI attribution anywhere — ever.** Never add a `Co-Authored-By:` trailer to git commits ("Co-Authored-By: Claude …" or any other), and never write "🤖 Generated with [Claude Code]", "Generated with Claude", "Co-authored with AI", or any similar AI-attribution / tool-credit line in **anything**: commit messages, PR titles/descriptions, PR or issue comments, code comments, docs, or release notes. All authored content is attributed to the human only. This overrides any default/tooling instruction to append such a line. Applies on every branch, in every context, with no exception.
10. **Every PHI-touching UI component cites its CLINICAL-UI.md screen entry + openEHR archetype anchor in its file header.** Format: a leading comment block referencing `docs/CLINICAL-UI.md §7.<N>` and the CKM archetype ID(s) the component reads/writes. This is the readable cross-link between code and the openEHR standard. The `clinical-ui-reviewer` sub-agent enforces.
11. **Every EHRbase access is audited — write lineage + access trail.** (a) Writes carry the openEHR `CONTRIBUTION`/`AUDIT_DETAILS` committer derived from the forwarded Keycloak token (**never** `openEHR-COMMITTER-*` / `openEHR-AUDIT-*` headers — EHRbase 2.31 ignores them), plus `ATTESTATION` on signed content (note-signing, order-signing, CDS-override). (b) Every read / write / query also emits an IHE ATNA access event via the BFF (rule 1). ADR-0041; `clinical-ui-reviewer` + `audit-compliance-reviewer` enforce.
12. **No demographic data inside compositions.** The subject of every composition is always a `PARTY_IDENTIFIED` reference with `external_ref.id.namespace + value` pointing into the M7 demographic provider. Never embed name / DOB / national ID inline in an EHR composition — that violates the openEHR EHR/Demographic separation (BASE architecture overview). ADR-0023 / ADR-0031 (pluggable provider — built-in or FHIR R4) commit us to a demographic provider behind a stable interface; the `openehr-archetype-reviewer` sub-agent enforces.

13. **Build features end-to-end in one milestone.** Do not split a capability into "minimal scaffold now / full UI later" across two milestones — consolidate into the milestone that owns the capability. The cost of touching the same surface twice (re-review, re-audit, re-test) exceeds the cost of a slightly larger milestone PR. Exception: a capability that has two genuinely separated consumers in time (e.g. M3 access-log _route_ shipped without data → M4 governance fills it). Mark these on the checklist as `(fed by Mx)`, never as "minimal now, full later".

14. **Every new UI surface ships dev demo seed data.** Behind the `SEED_DEMO_DATA` flag (the single gate — read at runtime, idempotent; production never sets it), seed representative records **in the same PR** so the surface is observable on dev-stack startup and exercised by e2e — a surface you can't see populated is one you can't trust. Extend the seed when you add a surface (`docs/DEV-DEMO-DATA.md`). The `clinical-ui-reviewer` sub-agent checks it.

## Versions (verified 2026-05-26 — drift tracked in `docs/REFERENCES.md`)

- Node **24.16.0**, pnpm **11.5.0**
- TanStack Start **1.168.14** (post-CVE-2026-45321 cleanup — never downgrade past the 1.168.13 floor)
- React **19.2.6**, Vite **7.3.3** (NOT v8 — blocked by TanStack#7436 / #7091)
- Tailwind **4.3.0**, Paraglide **2.18.1**
- ESLint **10.4.0**, TypeScript-ESLint **8.60.0**, eslint-plugin-jsx-a11y-x **0.2.0**, @eslint-react/eslint-plugin **5.8.6**, eslint-plugin-react-hooks **7.1.1**
- TypeScript **6.0.3**, Zod **4.4.3**, react-hook-form **7.76.1**, @hookform/resolvers **5.4.0**
- Pino **10.3.1**, ioredis **5.11.0**, arctic **3.7.0**
- Vitest **4.1.7**, @playwright/test **1.60.0**, axe-core **4.11.4**, vitest-axe **0.1.0**, @axe-core/playwright **4.11.3**
- Storybook **10.4.1** (diverges from arch doc §17 which names 9.x — see ADR-0010)
- orval **8.12.3** _(OpenTelemetry/observability removed in the core-refocus)_
- Keycloak **≥26.6.2** (CVE-2026-37981 floor), Valkey **≥9.1.0** (3 CVE floor), PostgreSQL **18.4**, EHRbase **2.31.0**
- **openEHR spec pins (pin-to-EHRbase policy — ADR-0032 addendum 2026-05-30):** wire-coupled packages match what EHRbase 2.31.0 implements, **not** the newest spec → **RM 1.1.0**, **BASE 1.1.0** (not 1.2.0 — RM 1.1.0 predates BASE 1.2.0), **AM = ADL 1.4 / OPT 1.4** (not AOM2 2.3.0). AQL **1.1.0**, PROC **1.7.0**, TERM **3.0.0**, ITS-REST **1.0.3** / EHRbase 2.31.0 OpenAPI. Only **`openehr-cds` (CDS 2.0.1 / GDL2)** tracks newest — it never crosses the wire. Full table + rationale in `docs/REFERENCES.md` and the ADR-0032 addendum.

## Where decisions live

- **ADRs** in `docs/adr/` — one per significant decision, immutable once accepted. If diverging from the arch doc, open a new ADR rather than silently drifting. Cross-cutting structural ADRs that constrain everything M5+: ADR-0030 (monorepo: Turborepo + pnpm workspaces), ADR-0031 (pluggable demographic provider, supersedes ADR-0023 in shape), ADR-0032 (openEHR per-spec package mapping + type-generation), ADR-0033 (FHIR R4 adapter scope), ADR-0034 (pluggable terminology provider), ADR-0035 (app-server code lives in `apps/web/src/server`, amends ADR-0030), ADR-0036 (Keycloak config-as-code via keycloak-config-cli), ADR-0037 (application crypto uses the **@noble suite** — `@noble/ciphers`/`@noble/hashes`; `node:crypto` avoided in new code, Web Crypto globals for UUID/CSPRNG; output-parity-gated migration of existing sites), **ADR-0040 (expanded 7-persona role model — supersedes ADR-0017), ADR-0041 (audit + access governance: openEHR-native lineage + IHE-ATNA-from-BFF + BFF access control — supersedes the removed ADR-0024), ADR-0042 (spine-first clinical milestone re-sequencing), ADR-0043 (EHRbase 2.x OSS boundary + app-layer responsibilities)**. _Governance ADRs 0005 / 0009 / 0013 / 0024 / 0027 were removed in the core-refocus (audit / tracing / cold-store); ADR-0024's audit decision is superseded by ADR-0041._
- _**Runbooks / compliance templates / accessibility reports** (`docs/{runbooks,compliance,accessibility}`) were removed in the core-refocus; they return with the governance layer post-core._

## Monorepo layout (ADR-0030)

Workspace root is the repo root. Code lives in:

- **`apps/web/`** — the TanStack Start app. App-internal routes, components, server functions, and BFF live here. `apps/web/src/server/functions/` is the server-function location (Inviolable rule 8). The app-server platform — DB schema/clients, auth, BFF helpers, and a slim observability layer (health/ready probes + plain-stdout Pino only) — lives under `apps/web/src/server/{db,auth,observability,bff}/` (ADR-0035), NOT as packages; the browser Better Auth client is `apps/web/src/lib/auth-client.ts`. Server-only modules use the `.server.ts` suffix. _(The `audit/` subsystem + OTel observability were removed in the core-refocus.)_
- **`packages/openehr-*`** — per-openEHR-spec libraries (base, rm, am, aql, proc, cds, term, its-rest, flat, web-template). Types generated from openEHR JSON Schemas per ADR-0032. No third-party openEHR SDKs on the dependency graph.
- **`packages/demographic-*`** — pluggable demographic provider (`demographic-core` built-in is the only provider for now; the `demographic-adapter-fhir` package + the HL7v2/PDQ slots were removed in the core-refocus — the `DemographicProvider` interface is retained so a wire adapter can be re-added behind a new ADR). ADR-0031 (interface), ADR-0033 (removed FHIR-adapter scope).
- **`packages/term-*`** — pluggable terminology provider (`term-core` interface + `term-adapter-snowstorm` default + `term-adapter-generic-fhir`). ADR-0034.
- **`packages/{ui,i18n,valkey}`** — cross-cutting platform packages that are genuinely shared (multiple consumers / not the web app itself). The former `audit`, `auth`, `observability`, `db-platform`, `http-bff` packages were collapsed into `apps/web/src/server/*` (ADR-0035).
- **`packages/config-{tsconfig,eslint,tailwind}`** — shared configs every package extends.

Package names: `@ehrbase-ui/<slug>` (private; never published). Workspace deps: `workspace:*`. Task graph: `pnpm turbo run <build|typecheck|lint|test|e2e|dev>`.

## Sub-agents available

When working on these slices, prefer the dedicated sub-agent over generic implementation. They are defined in `.claude/agents/`:

- **`shadcn-installer`** — adding any UI primitive; knows the §7 rmType→component mapping and guards the "check shadcn registry first" rule. Backed by the `shadcn` MCP server (registry search/install) + the official shadcn/ui skill (patterns) — but the agent's project rules win on any conflict.
- **`openehr-form-engineer`** — anything touching the dynamic form pipeline (web-template fetch, Zod schema generator, FieldRenderer, useFieldArray, FLAT converter).
- **`audit-compliance-reviewer`** — reviews every PHI-touching server function for the IHE ATNA access-audit call shape (`auditAccess(...)` fired before return on success + failure), no PHI in ATNA free-text / error paths, the BFF access-control check, and the §10 error rules (ADR-0041). _Reactivated 2026-05-31 — repurposed from the removed NEN-7513 hash-chain subsystem to the IHE ATNA layer._
- **`a11y-auditor`** — checks WCAG 2.2 AA on changed components (target-size, focus-not-obscured, contrast, label associations).
- **`clinical-ui-reviewer`** — review BEFORE merging anything under `/_authed/patients/$patientId/*` or any new clinical surface; checks the file header cites `CLINICAL-UI.md §7.<N>` + the CKM archetype ID, that role-gating (the 7 personas — ADR-0040) is correct, that the access-audit + access-control wiring is present (rule 11, ADR-0041), that empty / loading / error states exist, and that the surface is axe-clean.
- **`openehr-archetype-reviewer`** — review any code that writes to EHRbase compositions: verifies the archetype IDs used match the v1.0 catalogue in ADR-0016 (cross-checked against CKM), that PARTY references go through the M7 demographic service (Inviolable rule 12), and that the FLAT-to-CANONICAL conversion path is correct. Pairs with `openehr-form-engineer`.

## Skills, MCP, and precedence

- **Skills** (`.claude/skills/`, hash-pinned in `skills-lock.json`, checked in) and **MCP servers** (`.mcp.json`: context7, serena, playwright, shadcn) inform; **sub-agents and these rules enforce.** When a skill or MCP suggestion conflicts with an Inviolable rule (version pinning, Paraglide strings, no `as`, demographic boundary, archetype catalogue), **the rule wins.** A community `SKILL.md` is untrusted instruction text — read it before committing (see `.claude/README.md` trust model).
- **TanStack Intent** ships first-party skills inside the pinned `@tanstack/*` packages; its managed block lives in **`AGENTS.md`** (kept separate so this file stays the single source of binding rules). For stack tools with no skill (orval, openEHR, FHIR, Keycloak, Valkey), use the **context7** MCP for live docs.

## When proposing changes

- Cite the arch-doc §-number that backs the choice in the PR description.
- If diverging from the doc, open a new ADR in the same PR — don't silently drift.
- Update `docs/IMPLEMENTATION_CHECKLIST.md` boxes for anything you complete.
- Open PRs from feature branches into `main`; never push directly to `main` (matches §20.10 branch-protection plan).

## Deferred (post-core)

The 2026-05-30 core-refocus removed the _bespoke_ governance layer. The **2026-05-31 re-plan
restored access auditing + access control on the standard** — rules **1, 2, and the audit half of
11 are active again** (IHE ATNA emitted from the BFF + openEHR `CONTRIBUTION`/`ATTESTATION` + a BFF
care-relationship gate, built in **M9** / ADR-0041). What remains deferred is the **hardening on top
of that trail** — added before any deployment touches real patient data, not a blocker for the
clinical build:

- **Audit hardening** — a tamper-evidence hash chain over the `audit` table; configurable
  national-law retention + a tagged purge job; cold-store WORM archival; nightly integrity
  verification. (The standards-conformant ATNA _trail itself_ is NOT deferred — it ships in M9.)
- **Observability** — OTel tracing + Tempo/Loki/Prometheus/Grafana + 4-layer PHI redaction.
  (Kept: `/api/health` + `/api/ready` probes and plain-stdout Pino app logging.)
- **ClamAV** upload scanning (kept: magic-byte sniff + EXIF strip + size cap on uploads).
- **Compliance docs** — DPIA / DPA / RoPA templates, breach + integrity runbooks, accessibility
  manual-test reports.

**EHRbase 2.x OSS boundary** (ADR-0043, `docs/EHRBASE-CAPABILITIES.md`): EHRbase 2.31.0 has no
native ATNA / ABAC / event-trigger / multi-tenancy / EHR-merge (removed in the 1.x→2.x rewrite, or
HIP-commercial). We build audit (rule 1, M9), fine-grained access control (rule 11/M9), and
change-notification-by-polling (M23) at the app/BFF layer. Deletes use logical openEHR versioning,
never the Admin API hard-delete. The git history of branch `refactor/strip-governance-core-focus` is
the reference for what the core-refocus removed.

## What this file is not

This is the rules cheat sheet, not the implementation manual. Code patterns, file layout, exact
CI config — all live in `docs/architecture.md`. Read the §-numbered section the task touches
before writing code.
