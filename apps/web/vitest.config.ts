import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'
import { playwright } from '@vitest/browser-playwright'
import viteReact from '@vitejs/plugin-react'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'

// Two test projects (ADR-0047):
//   • unit      — jsdom component/lib tests (the historical config), self-contained
//   • storybook — every story run as a real browser test via @storybook/addon-vitest;
//                 storybookTest applies the @storybook/tanstack-react framework
//                 (router + server-fn mocking) and the app vite.config (Tailwind +
//                 the `@` alias), so this project needs no extra Vite wiring.
//
// `pnpm test` runs only `unit`; `pnpm test-storybook` runs only `storybook`
// (the latter needs a Chromium binary — `playwright install chromium`).
export default defineConfig({
  test: {
    // Coverage is a root-level option shared by the projects; only the unit run
    // (test:coverage) exercises it. Stories are excluded from coverage.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/routeTree.gen.ts',
        'src/paraglide/**',
        'src/components/ui/**', // vendored shadcn — not our code to cover
        'src/hooks/use-mobile.ts', // copied in with shadcn
        'src/**/*.stories.{ts,tsx}',
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
      ],
      // Foundation milestone: only the Button axe baseline test exists, so
      // global thresholds are deliberately low. The arch doc §24 v1.0 target
      // is 80% on src/lib + 60% overall + 90% on audit/auth — those gates
      // tighten as Milestones 2 (auth) and 4 (audit) bring real test surface.
      thresholds: {
        lines: 0,
        functions: 0,
        statements: 0,
        branches: 0,
      },
    },
    projects: [
      {
        resolve: {
          alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
          },
        },
        plugins: [viteReact()],
        test: {
          name: 'unit',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./src/test/setup.ts'],
          include: [
            'src/**/*.{test,spec}.{ts,tsx}',
            'src/**/__tests__/**/*.{ts,tsx}',
            // Workspace package tests live next to their source (ADR-0030).
            // Until each package gets its own vitest config (deferred to whichever
            // milestone first wants a per-package test workflow), apps/web's vitest
            // run scans them too. They share the apps/web jsdom environment + the
            // ./src/test/setup.ts global setup — fine for now because every package
            // test imports through `@ehrbase-ui/*` aliases, not relative paths into
            // apps/web internals.
            '../../packages/*/src/**/*.{test,spec}.{ts,tsx}',
            '../../packages/*/src/**/__tests__/**/*.{ts,tsx}',
          ],
          exclude: [
            'e2e/**',
            'node_modules/**',
            '.output/**',
            '.nitro/**',
            '**/dist/**',
            // Stories are run by the `storybook` project, not as jsdom unit tests.
            'src/**/*.stories.{ts,tsx}',
          ],
        },
      },
      {
        resolve: {
          // The `@` alias must be available to the project itself (preview +
          // setup files), not only to the storybookTest-composed story graph.
          alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
          },
        },
        plugins: [
          storybookTest({
            configDir: fileURLToPath(new URL('./.storybook', import.meta.url)),
          }),
        ],
        test: {
          name: 'storybook',
          // No setup file needed: since Storybook 10.3 @storybook/addon-vitest
          // auto-provisions the framework + preview + addon (a11y) annotations.
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
