# ADR-0047 — Adopt `@storybook/tanstack-react` + run stories as browser tests

- **Status:** Accepted
- **Date:** 2026-06-01
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** the server-function-stub approach recorded in ADR-0010's "Build notes"
- **Superseded by:** —

## Context

Storybook in `apps/web` was kept alive by hand-written workarounds for the
TanStack Start ↔ Storybook impedance mismatch. Rendering a component in the
browser preview pulls in any `createServerFn` it transitively imports, which in
turn drags the entire server-only graph (Drizzle/`postgres`, `ioredis`, `@noble`,
`@tanstack/start-storage-context → node:async_hooks`) into the client bundle and
breaks the build. The repo papered over this with **four custom files** aliased in
`.storybook/main.ts`:

- `patient-functions-stub.ts`, `terminology-functions-stub.ts` — fake client
  shapes for the server functions that storied components import.
- `async-hooks-stub.ts`, `perf-hooks-stub.ts` — browser shims for the
  `node:async_hooks` / `node:perf_hooks` named imports that leak through.

Plus a hand-rolled in-memory TanStack Router decorator (`withRouter`) so shell
components with `<Link>` / `useRouterState` could render.

This was fragile by construction: every new server function consumed by a story,
and every new `node:` import inside a server function, silently broke the build
until someone manually added another alias. No lint rule guarded it, and the
stubs encoded assumptions about the TanStack Start Vite plugin's post-transform
shape — they would rot the moment that transform changed.

Storybook **10.4** (already pinned here — ADR-0010) shipped a first-class
**`@storybook/tanstack-react`** framework, built with the TanStack core team,
that solves exactly these problems natively (verified against the npm registry,
the framework source in `node_modules`, and the official docs):

- A Babel **server-code-elimination** plugin rewrites `createServerFn().handler(…)`
  (and `createMiddleware` / `createIsomorphicFn` / `createServer|ClientOnlyFn`)
  to a `storybook/test` mock `fn()` and **eliminates the now-dead server imports**
  — replacing the two server-fn stubs.
- A **module-interception** plugin redirects `@tanstack/react-router`,
  `@tanstack/react-start*`, and `@tanstack/start-storage-context` to built-in
  mocks — which is what removes the `node:async_hooks` chain, replacing both node
  shims.
- A **server-only-stub** plugin replaces `.server.ts` files with throwing stubs
  (Inviolable rule 7).
- Its `viteFinal` auto-strips the TanStack Start Vite plugin (`name` starting
  `tanstack-start`).
- It **auto-wraps every story in a memory-backed (mocked) TanStack Router**,
  configurable per story via `parameters.tanstack.router`, replacing the
  `withRouter` decorator.

Separately, the component library had **no executable test gate** — stories were
only built (`storybook:build`) and eyeballed; `addon-a11y` ran in the UI as a
report, never failing CI. That is a weak position for software whose
accessibility is a legal release gate (EAA / WCAG 2.2 AA / EN 301 549; §12).

## Decision

1. **Switch the framework to `@storybook/tanstack-react@10.4.1`** and delete the
   four stub/shim files and the `withRouter` / `withTheme` decorators. Stories
   that need data set it per story with `mocked(serverFn).mockResolvedValue(…)`
   from `storybook/test`; stories that need a specific location use
   `parameters.tanstack.router`.
2. **Run every story as a real browser test** via `@storybook/addon-vitest@10.4.1`
   (Vitest 4 browser mode, Playwright/Chromium). `vitest.config.ts` becomes two
   projects — `unit` (the historical jsdom suite) and `storybook` — so
   `pnpm test` stays fast/unit-only and `pnpm test-storybook` runs the browser
   suite. A new **blocking** `storybook-test` CI job gates PRs.
3. **a11y is a hard gate:** `parameters.a11y.test = 'error'` in `preview.tsx` so
   any WCAG 2.2 AA / EN 301 549 violation fails the story test. The page-level
   `region` best-practice rule is disabled **only** at the component-story level
   (a component in isolation has no page `<main>`); page landmark structure stays
   covered by the Playwright e2e axe pass on real routes.
4. Add `play()` interaction tests to the interactive components (the
   command-palette global patient search, the openEHR FieldRenderer) so the gate
   exercises behaviour, not just render.

`vite.config.ts` keeps a **simplified** `isStorybook` guard (Storybook-safe
plugin set = `[tailwindcss()]`; React + Start handling come from the framework).
The guard is retained — not replaced by a `viteFinal` plugin filter — because the
framework strips only the Start plugin, while `nitro` / `@tanstack/devtools` /
Paraglide must still be excluded, and Paraglide's plugin is async (awkward to
filter post-hoc). No setup file is needed: since Storybook 10.3,
`@storybook/addon-vitest` auto-provisions the framework + preview + addon
annotations.

## Rationale

- The official framework is the canonical, vendor-supported integration; the
  stubs were a bespoke reimplementation of exactly what it now does, minus the
  maintenance burden and rot risk.
- Stories-as-tests turn the component library from a gallery into an executable,
  CI-enforced contract — the "proper end-to-end test" the work set out to get —
  and let the a11y gate actually block regressions instead of merely reporting
  them.
- Versions line up with zero friction: `@storybook/tanstack-react@10.4.1`
  matches core, `@vitest/browser-playwright@4.1.7` peer-requires the exact
  `vitest@4.1.7` we already pin, peer ranges on `@tanstack/react-router` /
  Vite 7 / React 19 are all satisfied.

## Consequences

**Positive:**

- Four stub files + two decorators + the env-coupled plugin contortions deleted;
  adding a server function to a storied component "just works" — no manual alias.
- Every story is a browser-verified, a11y-gated test in CI.
- `vite.config.ts` no longer carries Storybook-specific aliasing.

**Negative:**

- The `storybook-test` CI job installs Chromium (~adds a minute) and is a new
  required gate.
- We depend on a young framework package (`@storybook/tanstack-react`, first
  shipped in 10.4). Mitigation: it is pinned exactly and built by the Storybook +
  TanStack teams; the previous stub approach remains in git history if a rollback
  is ever needed.
- React Server Components are unsupported by the framework — not a constraint
  here (we don't use RSC).

## Verification (2026-06-01)

- [x] `pnpm storybook:build` exits 0 and emits `storybook-static/iframe.html`
      with no server-graph / `node:async_hooks` errors (the exact failure the
      stubs guarded).
- [x] `pnpm test-storybook` — 17 story tests pass in Chromium, incl. the
      command-palette + FieldRenderer `play()` tests.
- [x] a11y gate proven: a temporary story with a missing-`alt` image **failed**
      the run (`image-alt`), then was removed.
- [x] `pnpm test` (unit project) — 500 passed / 1 skipped, unaffected.
- [x] `pnpm typecheck` clean (no `as` casts — Inviolable rule 3).
- [x] `pnpm eslint . --max-warnings=0` clean.
