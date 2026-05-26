// Shared axe configuration for Vitest unit / component tests.
//
// Single source of truth for the rule-set + opt-ins. The matching
// configuration for Playwright E2E lives in e2e/axe-config.ts and must stay
// in sync — drift between unit and E2E axe configs is a known failure mode.
// See docs/architecture.md §12.4.

import type { RunOptions } from 'axe-core'

export const axeConfig: RunOptions = {
  runOnly: {
    type: 'tag',
    values: [
      'wcag2a',
      'wcag2aa',
      'wcag21a',
      'wcag21aa',
      'wcag22aa',
      'best-practice',
      'EN-301-549',
    ],
  },
  rules: {
    // WCAG 2.2 SC 2.5.8 (Target Size). Opt-in in axe-core 4.x; we want it on
    // because §12.5 enforces 24-pixel minimum target size.
    'target-size': { enabled: true },
  },
}
