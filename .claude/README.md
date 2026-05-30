# `.claude/` — Claude Code project config

This directory contains project-scoped Claude Code configuration. It is checked in so every contributor (and future Claude session) sees the same setup.

## What's here

### `agents/` — project sub-agents

Six sub-agents tuned to the hot spots of this codebase:

| Agent                           | When to invoke                                                                                                                                                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shadcn-installer.md`           | Adding any UI primitive. Enforces the "check shadcn registry first" rule from `docs/architecture.md` §6.                                                                                                                      |
| `openehr-form-engineer.md`      | Any work on the dynamic form pipeline (§7) — web-template parsing, Zod schema generation, FieldRenderer, FLAT converter, ClamAV-gated uploads, optimistic concurrency, autosave drafts.                                       |
| `audit-compliance-reviewer.md`  | **Mandatory** before merging anything in `src/server/functions/` or `src/routes/_authed/`. Read-only reviewer; reports findings against the §14 audit rules and §10 error-handling rules.                                     |
| `a11y-auditor.md`               | Any change to `src/components/`, `src/routes/`, or `src/components/ui/`. Validates the WCAG 2.2 AA + EN 301 549 baseline from §12.                                                                                            |
| `clinical-ui-reviewer.md`       | **Mandatory** before merging anything under `_authed/patients/$patientId/*` or any new clinical surface. Read-only reviewer; checks CLINICAL-UI.md citations, archetype refs, dual-layer audit, role-gating, UI states, a11y. |
| `openehr-archetype-reviewer.md` | Any code that writes to EHRbase compositions. Read-only reviewer; verifies archetype IDs vs ADR-0016/CKM, PARTY refs via the M7 demographic service, FLAT→CANONICAL conversion.                                               |

Invocation: `Agent` tool with `subagent_type: <agent-name>` or just describe the task and Claude will route to the right one.

### `..\.mcp.json` — MCP servers (in repo root, not here)

Four servers pinned for the project:

- **`context7`** — live documentation lookup for any library the project depends on. Use before any non-trivial API call, since training cutoffs drift. This is the **default coverage for stack tools that have no dedicated skill** (OpenTelemetry, orval, openEHR/EHRbase, FHIR, Keycloak, Valkey, Better Auth, Paraglide, …).
- **`serena`** — fast symbol-level code navigation. Use for "find every caller of `logAudit`" or "where is `FieldRenderer` defined" rather than `grep` for symbol-aware work.
- **`playwright`** — automated browser control for E2E debugging. Use when an E2E test is failing and the spec output is not enough.
- **`shadcn`** — search / browse / view / install components from the shadcn registry by name. Pairs with the `shadcn-installer` sub-agent: the MCP discovers, the agent enforces project rules (exact-pin versions, §7 rmType mapping, Paraglide strings). The agent's rules **win** on any conflict.

Contributors with `npx` and `uvx` available will pick these up automatically.

### `skills/` — project agent skills (checked in)

Agent skills are vendor / community **best-practice instruction sets** loaded on demand. They are installed at **project scope** (`.claude/skills/`) and committed so every contributor + CI shares the same set; `skills-lock.json` hash-pins each one. Install commands and the curated list live in the setup plan; install with the `skills` CLI (`pnpm dlx skills add …`), `gh skill install`, or `/plugin install …`.

**Trust model — this is clinical software.** Every `SKILL.md` is instruction text the agent will follow, so a community skill is a prompt-injection / supply-chain surface. Before committing any skill:

1. Preview (`--list`) then **read the full SKILL.md + reference files**.
2. Hash-pin it (`skills-lock.json` / `gh skill` frontmatter SHA).
3. Re-review on every update.

**Precedence:** skills never override `CLAUDE.md` Inviolable rules or a sub-agent. On any conflict — version pinning, Paraglide strings, `as` casts, audit calls, archetype catalogue — **the project rule wins.** Skills inform; sub-agents and `CLAUDE.md` enforce.

Skills currently sourced: the official **shadcn/ui** skill, **TanStack Intent** (first-party, shipped inside the pinned `@tanstack/*` packages; its managed block lives in `AGENTS.md`, not `CLAUDE.md`), plus curated community skills (zod, react-hook-form, tailwind, better-auth, vitest, …) per the setup plan.

## What is not here

- **Settings** — no `settings.json` is shipped at the project level today; project-scoped permissions land if a later milestone needs them. Add carefully — settings.json is sensitive to per-user paths.

## When to update

- A new sub-agent: add the markdown file under `agents/`, document it in this README, and update the "Sub-agents available" section of `CLAUDE.md`.
- A new MCP server: edit `.mcp.json` (repo root) and document the reason here.
- A new skill: review the `SKILL.md` (trust model above), install at project scope, hash-pin it, list it under `skills/` here. Project-specific _rules_ (not just docs) still belong in a sub-agent — a generic skill cannot encode rmType mapping, the archetype catalogue, or the audit shape.

## House rules for Claude

All project-level rules live in [`CLAUDE.md`](../CLAUDE.md) at the repo root, not here. That file is loaded into every Claude session automatically.
