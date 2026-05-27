import { defineConfig, devices } from '@playwright/test'

// docs/architecture.md §12.4 + §24 — E2E tests run against a dev server
// boot started by Playwright's webServer config.

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['html'], ['github']] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // The full-stack auth suite (E2E_FULL_STACK=1) runs against the PRODUCTION
  // build: the `vite dev` module runner intermittently 500s on the first eval
  // of an SSR route chunk, making the multi-step login flow flaky. The built
  // Nitro server has no such race and also exercises the enforcing production
  // CSP. The fast default suite still uses `pnpm dev`.
  webServer: {
    command:
      process.env.E2E_FULL_STACK === '1'
        ? 'node .output/server/index.mjs'
        : 'pnpm dev',
    url: 'http://localhost:3000',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
