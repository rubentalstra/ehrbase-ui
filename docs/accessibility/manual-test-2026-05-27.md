# Manual accessibility test report — 2026-05-27

- **Milestone:** M3 (UI shell + i18n + state + error handling + accessibility)
- **Standard:** WCAG 2.2 level AA + EN 301 549 (docs/architecture.md §12)
- **Scope:** Public home (`/`), accessibility statement (`/accessibility`),
  authed workspace shell (`/_authed`), `/me`, `/me/access-log`.
- **Tester:** @rubentalstra (automatable checks). Screen-reader passes: PENDING.

## Summary

| Area                                                              | Method                                              | Result                              |
| ----------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------- |
| Automated rule scan (axe, WCAG 2.2 AA + EN 301 549 + target-size) | Vitest component axe + Playwright E2E axe           | PASS                                |
| Keyboard operability                                              | Manual + E2E (skip-link, command palette, menus)    | PASS                                |
| Visible focus indicator                                           | Manual (`:focus-visible` rings, §12.6)              | PASS                                |
| 200% zoom / reflow (SC 1.4.10)                                    | Manual (Chromium)                                   | PASS                                |
| Target size ≥ 24px (SC 2.5.8)                                     | axe `target-size` rule enabled                      | PASS                                |
| Focus not obscured (SC 2.4.11)                                    | Manual (`scroll-margin-top` = header height)        | PASS                                |
| Consistent help (SC 3.2.6)                                        | Manual (SiteFooter, fixed order, every authed page) | PASS                                |
| Contrast (SC 1.4.3)                                               | axe + manual (destructive token darkened, §12)      | PASS                                |
| Screen reader — NVDA (Windows)                                    | —                                                   | **PENDING — human run before v1.0** |
| Screen reader — VoiceOver (macOS/iOS)                             | —                                                   | **PENDING — human run before v1.0** |

## Detail — completed checks

### Automated rule scan

- Component-level: `vitest-axe` on `Button` and `ModeToggle`; rule set in
  `src/test/axe-config.ts` (mirrored in `e2e/axe-config.ts`).
- Page-level: Playwright `@axe-core/playwright` on `/`, `/accessibility`
  (smoke spec, public) and `/me`, `/me/access-log` (auth spec, full stack).
- `target-size` (SC 2.5.8) is explicitly enabled in both configs.

### Keyboard operability

- Skip-to-content link is the first focusable element; Tab → Enter moves focus
  into `<main id="main-content">` (E2E: "skip link moves focus to the main
  content").
- Command palette opens on Cmd/Ctrl+K and closes on Escape (E2E: "Cmd/Ctrl+K
  opens the command palette"); the sidebar toggle owns Cmd/Ctrl+B (no collision).
- Sidebar, theme, and user menus are reachable and operable by keyboard (Radix
  primitives).

### Visible focus / focus not obscured

- Global `:focus-visible` outline rings (`src/styles.css`).
- `scroll-margin-top: calc(var(--header-height) + 1rem)` on focusable elements
  and headings keeps a focused target clear of the sticky header (SC 2.4.11).

### Zoom / reflow

- Verified at 200% browser zoom in Chromium: content reflows, no loss of
  function, sidebar collapses to the icon rail / sheet on narrow widths.

### Contrast

- Destructive token darkened to L=0.52 (≥ 4.5:1) in a prior milestone; axe
  contrast checks pass on the shell, statement, and account pages.

## Detail — PENDING (human required)

Screen-reader verification cannot be automated and is deferred to the v1.0
pre-release hardening pass (M8):

- **NVDA + Firefox/Chrome (Windows):** landmark navigation (banner / nav / main
  / contentinfo), sidebar nav announcement, command-palette dialog semantics,
  toast `aria-live` announcement, error-boundary `role="alert"`.
- **VoiceOver + Safari (macOS) and iOS:** same checklist plus rotor landmark
  navigation and focus order on the dropdown menus.

These items are tracked in `docs/IMPLEMENTATION_CHECKLIST.md` (M3 + M8) and must
be signed off before the public accessibility statement is finalised.
