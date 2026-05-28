# ADR-0014 — UI shell: state, data layer, i18n routing, and the CSP style tradeoff

- **Status:** Accepted
- **Date:** 2026-05-27
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

Architecture-doc reference: §6 (UI primitives), §9 (theme), §10 (error
handling), §11 (i18n), §12 (accessibility). Milestone 3 turns the bare authed
page into a clinical workspace shell and wires the state/data/error rails. A
handful of choices diverged from the literal architecture sketch and are
recorded here so the drift is explicit rather than silent.

## Decision

**Theme — `next-themes`, not the hand-rolled §9 sketch.** It is already a
dependency (the vendored `sonner` Toaster depends on its `useTheme()`), ships
the pre-hydration no-flash script, and exposes a `nonce` prop. We feed it
`useRouter().options.ssr?.nonce` so the inline theme script satisfies the
strict `script-src` CSP. A bespoke provider would re-implement all of this with
no upside.

**Data layer — TanStack Query with SSR integration, now.** `makeQueryClient()`
is instantiated **per request inside `getRouter()`** (server-side isolation —
no PHI cache bleed, §5.5) and wired via `setupRouterSsrQueryIntegration({
router, queryClient })` (not the older `routerWithQueryClient`). No real queries
run in M3; this stands the layer up for M5/M6. The cache-level `onError` funnels
failures through `reportClientError` → correlationId + sanitized server log +
one generic toast (§10).

**i18n — build the §11.4 URL-prefix machinery now, English-only.** Per the
**official Paraglide + TanStack Start integration example** (see
`scripts/paraglide-compile.mjs` and `vite.config.ts` headers for the source
links): `paraglideMiddleware` wraps the framework's `server-entry` in
`src/server.ts` to establish the locale `AsyncLocalStorage` context so
`getLocale()` resolves during SSR; the router `rewrite` uses Paraglide's
`deLocalizeUrl`/`localizeUrl`. URL scheme is **symmetric** — every locale
(including English) lives under `/{locale}/...` per the docs' "Prefixing All
Locales" recipe — so adding any further EU language (Dutch, German, French,
Spanish, …) is config-only and no locale is privileged at the URL layer (§11.6).

**CSP — `style-src 'unsafe-inline'` (script-src unchanged).** Radix primitives
(dropdown, collapsible, command, tooltip, sheet) and the shadcn sidebar emit
inline `style` **attributes** for measured positioning/animation. A nonce
applies to `<style>` elements, not attributes, so there is no nonce-only way to
allow them. We relax **style-src** to `'unsafe-inline'`; `script-src` stays on
`'nonce-…' 'strict-dynamic'`, so script-injection XSS is still blocked. Inline
style attributes are a low-risk surface (no script execution). This is the most
likely prod-CSP break and is asserted against by the full-stack E2E (no
CSP-violation console errors under the enforcing policy).

## Notes on smaller divergences

- **Paraglide `strategy` + `urlPatterns` are configured exactly as the
  official docs prescribe.** They live inline in `vite.config.ts` (per the
  Paraglide TanStack Start example) and are mirrored inline in
  `scripts/paraglide-compile.mjs` (the documented programmatic invocation —
  one of Paraglide's three official entry points, and the only one that
  accepts `urlPatterns` when the CLI cannot). No custom helper, no dynamic
  generation from `settings.json` — the configs are pinned in both files so a
  package update can't silently break them. Adding a locale = editing both
  files in lockstep (§11.6).
- **`paraglide:check` is a key-parity gate, not a git-diff gate.** The generated
  Paraglide output under `src/paraglide` is gitignored, so "compile + assert no
  git diff" is a no-op. `scripts/paraglide-check.mjs` instead asserts every
  locale defines the same message keys — the faithful §11.7 completeness intent.
  English-only today; the same gate catches any added locale missing a key
  before merge.
- **The vendored `sidebar-07` block is our code; the pure shadcn primitives are
  not.** The adapted block components (`app-sidebar`, the `nav-*` files,
  `team-switcher`) are fully linted and formatted. The downloaded shadcn
  primitives under `src/components/ui` (and `src/hooks/use-mobile.ts`) are now
  in ESLint `globalIgnores` and `.prettierignore`, so a routine `shadcn add`
  does not fight the strict source rules. `tsc` still typechecks them.
- **The content column is a plain flex container, not `SidebarInset`.**
  `SidebarInset` renders its own `<main>`; nesting our `<main id="main-content">`
  inside it would produce nested `main` landmarks (invalid HTML / axe failure).
  A div gives clean `banner` / `main` / `contentinfo` landmarks.

## Consequences

**Positive:** the shell, theme, data, error, and i18n rails are in place with
no PHI features yet; accessibility is testable; adding any further EU language
is config-only.
**Negative:** `style-src 'unsafe-inline'` is a deliberate weakening of the style
CSP (mitigated: script-src unchanged, E2E-asserted). Carrying the SSR query
integration before any query exists is mild over-provisioning, accepted to
avoid reworking the router context in M5.
