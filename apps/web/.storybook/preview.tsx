import type { Decorator, Preview } from '@storybook/tanstack-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../src/styles.css'

import { ThemeProvider } from '@/components/theme/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'

// `@storybook/tanstack-react` already wraps every story in a memory-backed
// (mocked) TanStack Router, so the providers left to supply are the theme +
// tooltip context shell components expect, plus a TanStack Query client for the
// components that read server functions via useQuery (e.g. CommandPalette).
// ADR-0047 retired the hand-written withRouter / withTheme decorators for this.
const queryClient = new QueryClient({
  defaultOptions: {
    // No retries/refetch in stories — a mocked server fn should resolve once.
    queries: { retry: false, refetchOnWindowFocus: false, gcTime: 0 },
  },
})

const withProviders: Decorator = (Story) => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
)

// Axe rule set mirrors src/test/axe-config.ts + e2e/axe-config.ts.
const preview: Preview = {
  decorators: [withProviders],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      // Hard gate: any violation fails the story test in the addon-vitest
      // browser run, matching the EAA / WCAG 2.2 AA legal release gate
      // (docs/architecture.md §12, ADR-0047). 'error' | 'todo' | 'off'.
      test: 'error',
      // axe RunOptions (same shape as src/test/axe-config.ts).
      options: {
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
          // WCAG 2.2 SC 2.5.8 (Target Size) — opt-in in axe 4.x (§12.5).
          'target-size': { enabled: true },
          // `region` is a page-level best-practice rule (all content inside a
          // landmark). It always fires for a component rendered in isolation,
          // which has no page <main>. Page-level landmark structure is enforced
          // by the Playwright e2e axe pass on real routes, not at the
          // component-story level — so disable it here only. Every WCAG 2.2 AA /
          // EN 301 549 success criterion stays a hard gate (ADR-0047).
          region: { enabled: false },
        },
      },
    },
  },
}

export default preview
