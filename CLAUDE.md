# Project-level rules for Claude sessions on `ehrbase-ui`

Authoritative spec: [`docs/architecture.md`](./docs/architecture.md) (v3.4). When in doubt, check the §-numbered section. This file is the cheat sheet, not the source of truth.

Progress tracker: [`docs/IMPLEMENTATION_CHECKLIST.md`](./docs/IMPLEMENTATION_CHECKLIST.md). External links: [`docs/REFERENCES.md`](./docs/REFERENCES.md).

## Inviolable rules (don't compromise these — clinical software)

1. **Audit before anything.** Every server function that touches PHI calls `logAudit()` (§14.3). Never write a PHI-touching function without the audit call already wired.
2. **PHI never in error messages, logs, or trace spans.** Conflate 404 and 403 when the existence of a record is itself sensitive (§10). Application-log redaction filter is layered; trace spans get four redaction layers (§13.2).
3. **No `as` casts** — ESLint blocks them. Use Zod parse or type guards (§17 Conventions).
4. **No hard-coded UI strings.** Every user-visible string goes through a Paraglide message function: `m.<key>()` rather than `"Patient records"`. The TypeScript compiler enforces (§11.5, §11.7).
5. **Pin every dependency exactly** in `package.json`. No `^`, no `~`. Same for GitHub Actions (SHA-pin, not tag) and Docker images (no `:latest`) (§17, §20.1, §5.12).
6. **shadcn/ui registry first.** When a UI primitive is needed, check the official shadcn/ui registry before writing custom code (§6). Custom UI primitives are reserved for openEHR-specific concerns (dynamic form field renderer, composition tree viewer, AQL editor wrapper, vitals charts).
7. **`.server.ts` suffix** for files that must never reach the client bundle (§17 Conventions).
8. **Server functions live in `src/server/functions/<feature>.functions.ts`** (§17 Conventions).
9. **Never add a `Co-Authored-By:` trailer to git commits.** No "Co-Authored-By: Claude …", no other AI attribution, no automatic co-authors of any kind. Commits are authored by the human committer only. Applies to every commit Claude creates on this repo, on every branch, in every context.

## Versions (verified 2026-05-26 — drift tracked in `docs/REFERENCES.md`)

- Node **24.16.0**, pnpm **11.3.0**
- TanStack Start **1.168.13** (post-CVE-2026-45321 cleanup — never downgrade past this)
- React **19.2.6**, Vite **7.3.3** (NOT v8 — blocked by TanStack#7436 / #7091)
- Tailwind **4.3.0**, Paraglide **2.18.1**
- ESLint **10.4.0**, TypeScript-ESLint **8.60.0**, eslint-plugin-jsx-a11y-x **0.2.0**, @eslint-react/eslint-plugin **5.8.5**, eslint-plugin-react-hooks **7.1.1**
- TypeScript **6.0.3**, Zod **4.4.3**, react-hook-form **7.76.1**, @hookform/resolvers **5.4.0**
- Pino **10.3.1**, ioredis **5.11.0**, arctic **3.7.0**
- Vitest **4.1.7**, @playwright/test **1.60.0**, axe-core **4.11.4**, vitest-axe **0.1.0**, @axe-core/playwright **4.11.3**
- Storybook **10.4.1** (diverges from arch doc §17 which names 9.x — see ADR-0010)
- orval **8.12.3**, @opentelemetry/sdk-node **0.218.0**
- Keycloak **≥26.6.2** (CVE-2026-37981 floor), Valkey **≥9.1.0** (3 CVE floor), PostgreSQL **18.4**, EHRbase **2.31.0**

## Where decisions live

- **ADRs** in `docs/adr/` — one per significant decision, immutable once accepted. If diverging from the arch doc, open a new ADR rather than silently drifting.
- **Runbooks** in `docs/runbooks/` — operational procedures (breach response, audit-integrity check, key rotation, DR drill, signature verification).
- **Compliance templates** in `docs/compliance/` — DPIA (§14.10), DPA (§14.1), RoPA (§14.1).
- **Accessibility manual-test reports** in `docs/accessibility/manual-test-YYYY-MM-DD.md` — one per release (§12.7).

## Sub-agents available

When working on these slices, prefer the dedicated sub-agent over generic implementation. They are defined in `.claude/agents/`:

- **`shadcn-installer`** — adding any UI primitive; knows the §7 rmType→component mapping and guards the "check shadcn registry first" rule.
- **`openehr-form-engineer`** — anything touching the dynamic form pipeline (web-template fetch, Zod schema generator, FieldRenderer, useFieldArray, FLAT converter).
- **`audit-compliance-reviewer`** — review **BEFORE** merging anything in `src/server/functions/` or under `_authed/`; checks every PHI-touching function for §14 audit calls, pseudonymization, hash-chain integration, PHI-leak hazards.
- **`a11y-auditor`** — checks WCAG 2.2 AA on changed components (target-size, focus-not-obscured, contrast, label associations).

## When proposing changes

- Cite the arch-doc §-number that backs the choice in the PR description.
- If diverging from the doc, open a new ADR in the same PR — don't silently drift.
- Update `docs/IMPLEMENTATION_CHECKLIST.md` boxes for anything you complete.
- Open PRs from feature branches into `main`; never push directly to `main` (matches §20.10 branch-protection plan).

## What this file is not

This is the rules cheat sheet, not the implementation manual. Code patterns, file layout, exact CI config, full audit schema — all live in `docs/architecture.md`. Read the §-numbered section the task touches before writing code.
