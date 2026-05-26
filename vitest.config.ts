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
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'src/**/__tests__/**/*.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', '.output/**', '.nitro/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/routeTree.gen.ts',
        'src/paraglide/**',
        'src/**/*.stories.{ts,tsx}',
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
      ],
      thresholds: {
        // docs/architecture.md §24 — 80% statements on src/lib, 60% overall,
        // auth/audit pinned to 90% (tightened when those modules land).
        lines: 60,
        functions: 60,
        statements: 60,
        branches: 50,
      },
    },
  },
})
