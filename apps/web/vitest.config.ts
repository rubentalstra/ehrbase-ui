import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [viteReact()],
  test: {
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
    exclude: ['e2e/**', 'node_modules/**', '.output/**', '.nitro/**', '**/dist/**'],
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
  },
})
