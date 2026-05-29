// Shared axe configuration for Playwright E2E tests.
//
// Mirror of src/test/axe-config.ts. Drift between the two is a known failure
// mode (docs/architecture.md §12.4) — update both together when adjusting
// rule-sets.

export const AXE_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22aa',
  'best-practice',
  'EN-301-549',
] as const

export const AXE_RULES = {
  // WCAG 2.2 SC 2.5.8 — opt-in in axe-core; we enable it (matches §12.5).
  'target-size': { enabled: true },
}
