// Full auth-flow E2E (docs/architecture.md §5, §14). These require the live
// stack (Keycloak + Valkey + the audit database + the dev server wired to
// them), so they are gated behind E2E_FULL_STACK=1. The CI integration job
// brings the stack up, runs db:migrate, and sets that flag; the fast default
// `pnpm e2e` skips them and runs only the public smoke spec.
//
// The realm has brute-force + quick-login protection (bruteForceProtected),
// which locks a user that logs in repeatedly in quick succession. So we run
// SERIALLY and log in exactly ONCE (a shared authenticated page); the
// read-only assertions reuse it, and the logout test runs last on that page.
// The unauthenticated-redirect test uses its own fresh context (no login).

import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import postgres from 'postgres'

import { AXE_RULES, AXE_TAGS } from './axe-config'

const FULL_STACK = process.env.E2E_FULL_STACK === '1'

// `vite dev`'s module runner intermittently 500s on the first eval of an SSR
// route chunk (a dev-only cold-start race; the production server entry is
// unaffected). Retry the navigation until the server returns a non-5xx.
async function gotoStable(page: Page, url: string): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      // 'commit' resolves at navigation commit — before client hydration can
      // fire a beforeLoad redirect, avoiding "navigation interrupted" errors.
      const res = await page.goto(url, { waitUntil: 'commit' })
      if (!res || res.status() < 500) return
    } catch {
      // Interrupted by an app redirect — the caller asserts the final URL.
      return
    }
    await page.waitForTimeout(1000)
  }
}

test.describe('Authenticated flow', () => {
  test.skip(!FULL_STACK, 'requires the full stack (E2E_FULL_STACK=1)')
  test.describe.configure({ mode: 'serial' })

  let page: Page

  test.beforeAll(async ({ browser }) => {
    // axe-core/playwright requires an explicit browser context (not the
    // implicit one from browser.newPage()).
    const context = await browser.newContext()
    page = await context.newPage()
    // `_authed` is a pathless layout, so the protected page's URL is /me.
    // The first hit to a server-route chunk under `vite dev` can race the
    // dev-worker module reload and 500; retry until the login redirect to the
    // Keycloak form succeeds (a dev-only artifact — the prod server entry is
    // unaffected).
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await page.goto('/api/auth/login?redirect=/me')
      if (res && res.status() < 500) break
      await page.waitForTimeout(1000)
    }
    await page.fill('#username', 'dev-clinician')
    await page.fill('#password', 'DevClinician123!')
    await page.click('#kc-login, [type="submit"]')
    await page.waitForURL('**/me')
    // The login redirect may land on /me while the dev module-runner is still
    // racing (URL matches but body is a transient 500). Re-render cleanly now
    // that the session cookie is set, so the reused page is authed + rendered.
    await gotoStable(page, '/me')
    await expect(page.getByRole('heading', { name: /my account/i })).toBeVisible()
  })

  test.afterAll(async () => {
    await page.close()
  })

  test('unauthenticated visit to a protected route redirects to login', async ({
    browser,
  }) => {
    const fresh = await browser.newPage()
    await gotoStable(fresh, '/me')
    await fresh.waitForURL(/\/(realms\/ehrbase|api\/auth\/login)/)
    expect(fresh.url()).toMatch(/realms\/ehrbase|api\/auth\/login/)
    await fresh.close()
  })

  test('login shows the user name and clinician role', async () => {
    await expect(page.getByRole('heading', { name: /my account/i })).toBeVisible()
    // Exact match: /clinician/i would also hit "Signed in as Dev Clinician".
    await expect(page.getByText('clinician', { exact: true })).toBeVisible()
  })

  test('/me has no WCAG 2.2 AA violations', async () => {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const results = await new AxeBuilder({ page })
      .withTags([...AXE_TAGS])
      .options({ rules: AXE_RULES })
      .analyze()
    expect(results.violations).toEqual([])
  })

  test('break-glass grants emergency access', async () => {
    await gotoStable(page, '/me')
    await page.fill(
      '#bg-justification',
      'Patient in ER, unconscious, need allergy history urgently.',
    )
    await page.getByRole('button', { name: /request emergency access/i }).click()
    await expect(page.getByText(/emergency access granted/i)).toBeVisible()
  })

  test('the audit log records the LOGIN with an intact hash chain', async () => {
    const sql = postgres(
      process.env.AUDIT_DB_URL ??
        'postgres://audit_writer:audit_writer@localhost:5432/audit',
    )
    try {
      const rows = await sql<
        { action: string; hash: string; previous_hash: string | null }[]
      >`SELECT action, hash, previous_hash FROM audit_events ORDER BY timestamp ASC`
      expect(rows.length).toBeGreaterThan(0)
      expect(rows.some((r) => r.action === 'LOGIN')).toBe(true)
      // No row may have a null hash, and every non-genesis row must link to a
      // hash that exists earlier in the chain.
      const hashes = new Set<string>()
      for (const row of rows) {
        expect(row.hash).toBeTruthy()
        if (row.previous_hash !== null) {
          expect(hashes.has(row.previous_hash)).toBe(true)
        }
        hashes.add(row.hash)
      }
    } finally {
      await sql.end()
    }
  })

  // Runs last (serial): tears down the shared session and confirms re-gating.
  test('logout clears the session and re-gates protected routes', async () => {
    await gotoStable(page, '/api/auth/logout')
    await page.waitForLoadState('domcontentloaded')
    await gotoStable(page, '/me')
    await page.waitForURL(/\/(realms\/ehrbase|api\/auth\/login)/)
    expect(page.url()).toMatch(/realms\/ehrbase|api\/auth\/login/)
  })
})
