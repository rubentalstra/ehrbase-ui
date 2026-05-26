# ADR-0010 — Storybook major upgrade (9 → 10)

- **Status:** Accepted
- **Date:** 2026-05-26
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

`docs/architecture.md` v3.4 §17 names `Storybook 9.x` as the component-library tool. During the foundation-milestone version verification (`docs/REFERENCES.md`, re-fetched 2026-05-26), the npm registry shows `storybook@10.4.1` as the current latest, released after the architecture doc was authored. The major-version jump matters for:

- `@storybook/react-vite` peer-range (Vite 7 support changed between 9 and 10)
- the `addon-a11y` v9 → v10 migration (config-shape change for axe-core integration)
- ecosystem addons (visual-testing, interaction-test, etc.) — most have shipped v10-compatible releases, a few haven't.

The architecture doc explicitly anticipates this kind of drift: "the table is a snapshot — the lockfile is the source of truth, Dependabot keeps drift in check, and re-verification happens by web-fetch only, never by recollection".

## Decision

Pin `storybook@10.4.1` (and matching `@storybook/react-vite@10.4.1` + `@storybook/addon-a11y@10.4.1`) rather than the doc-named `9.x` line.

Before merging the foundation PR, run the **Step 1H smoke check**:

1. `pnpm storybook` boots without errors.
2. The Button story renders all variants.
3. `addon-a11y` panel runs axe-core against the story without throwing and reports zero violations.
4. The Vite-7 plugin chain (Paraglide + Tailwind v4) still produces a working bundle.

If any check fails, fall back to `storybook@^9` and update this ADR to `Status: Superseded by ADR-0011 (rollback)`.

## Rationale

- We are greenfield; there is no Storybook 9 codebase to migrate. Adopting the current major has zero migration cost.
- Storybook 10 has been stable for several minor releases by the time of pinning; the new major is past the typical "wait for x.2" hardening window.
- Following the doc's stale 9.x value without a verification cycle would defeat the version-drift discipline the doc itself enforces.

## Consequences

**Positive:**
- Foundation ships with the current-supported major; upstream security backports for the previous major (9.x) won't matter to us.
- `addon-a11y` v10 has the rule-tag overrides we need in the simpler config shape, matching the §12.4 axe configuration pattern in the architecture doc.

**Negative:**
- Some Storybook addons lag a major behind. If we adopt one in the future (e.g., visual-testing), we may need to wait for its v10 release or pick a different tool.
- The architecture-doc text in §17 says "9.x" until a doc revision catches up. This ADR is the canonical record of the divergence; the doc revision will fold this in at the next pass.

## Verification (filled in after step 1H runs)

- [ ] `pnpm storybook` boots cleanly
- [ ] Button story renders all variants
- [ ] `addon-a11y` shows zero violations on Button
- [ ] `pnpm build` still succeeds with the Storybook plugin loaded

## Links

- [Storybook 10 release notes](https://storybook.js.org/blog) (resolve to specific 10.0 announcement when the smoke check runs)
- [Architecture doc § 17 "Storybook for the component library"](../architecture.md#storybook-for-the-component-library)
- [Verified version table](../REFERENCES.md#component-library--docs)
