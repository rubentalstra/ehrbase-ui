# Pull Request

## Summary

<!--
What changes does this PR make and why? 1-3 sentences.
Cite the docs/architecture.md §-number that backs the change.
-->

## Linked checklist item

<!-- Which line of docs/IMPLEMENTATION_CHECKLIST.md does this advance? -->

- [ ] Milestone **, sub-step **

## Test plan

<!-- How was this verified? Tick all that apply. -->

- [ ] `pnpm typecheck` clean
- [ ] `pnpm eslint . --max-warnings=0` clean
- [ ] `pnpm test` passes
- [ ] `pnpm e2e` passes (if route or component shape changed)
- [ ] `pnpm storybook:build` clean (if shadcn UI primitive changed)
- [ ] `pnpm storybook` renders the affected stories with addon-a11y zero violations
- [ ] `docker compose up -d` boots the dev stack (if infra changed)
- [ ] Manual screen-reader pass (if user-facing UI changed) — note tool used

## Sub-agent reviews required

<!-- Tick the agents that must run before merge. See .claude/agents/. -->

- [ ] `audit-compliance-reviewer` — touched `src/server/functions/` or `src/routes/_authed/`
- [ ] `a11y-auditor` — touched `src/components/` or `src/routes/`
- [ ] `shadcn-installer` — added a new UI primitive
- [ ] `openehr-form-engineer` — touched §7 form pipeline

## Risk

<!-- Anything reviewers should know before approving. -->

## ADR

<!-- If this diverges from docs/architecture.md, link the new ADR. -->
