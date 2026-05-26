# `.claude/` — Claude Code project config

This directory contains project-scoped Claude Code configuration. It is checked in so every contributor (and future Claude session) sees the same setup.

## What's here

### `agents/` — project sub-agents

Four sub-agents tuned to the four hot spots of this codebase:

| Agent | When to invoke |
|---|---|
| `shadcn-installer.md` | Adding any UI primitive. Enforces the "check shadcn registry first" rule from `docs/architecture.md` §6. |
| `openehr-form-engineer.md` | Any work on the dynamic form pipeline (§7) — web-template parsing, Zod schema generation, FieldRenderer, FLAT converter, ClamAV-gated uploads, optimistic concurrency, autosave drafts. |
| `audit-compliance-reviewer.md` | **Mandatory** before merging anything in `src/server/functions/` or `src/routes/_authed/`. Read-only reviewer; reports findings against the §14 audit rules and §10 error-handling rules. |
| `a11y-auditor.md` | Any change to `src/components/`, `src/routes/`, or `src/components/ui/`. Validates the WCAG 2.2 AA + EN 301 549 baseline from §12. |

Invocation: `Agent` tool with `subagent_type: <agent-name>` or just describe the task and Claude will route to the right one.

### `..\.mcp.json` — MCP servers (in repo root, not here)

Three servers pinned for the project:

- **`context7`** — live documentation lookup for any library the project depends on. Use before any non-trivial API call, since training cutoffs drift.
- **`serena`** — fast symbol-level code navigation. Use for "find every caller of `logAudit`" or "where is `FieldRenderer` defined" rather than `grep` for symbol-aware work.
- **`playwright`** — automated browser control for E2E debugging. Use when an E2E test is failing and the spec output is not enough.

Contributors with `npx` and `uvx` available will pick these up automatically.

## What is not here

- **Skills** — Claude Code skills are installed at the user level (`~/.claude/plugins/`) and the `find-skills` skill discovers them on demand. The project pulls in `shadcn`-style work through the `shadcn-installer` sub-agent rather than through a dedicated skill, because the sub-agent encodes the project-specific rules (rmType mapping, version pinning, etc.) that a generic skill cannot.
- **Settings** — no `settings.json` is shipped at the project level today; project-scoped permissions land if a later milestone needs them. Add carefully — settings.json is sensitive to per-user paths.

## When to update

- A new sub-agent: add the markdown file under `agents/`, document it in this README, and update the "Sub-agents available" section of `CLAUDE.md`.
- A new MCP server: edit `.mcp.json` (repo root) and document the reason here.
- A skill becomes load-bearing for the project: prefer encoding it in a sub-agent unless the skill is genuinely cross-project.

## House rules for Claude

All project-level rules live in [`CLAUDE.md`](../CLAUDE.md) at the repo root, not here. That file is loaded into every Claude session automatically.
