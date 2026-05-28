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
  // Collects any Content-Security-Policy violation surfaced to the console
  // while exercising the shell. Under the enforcing prod CSP (the built server)
  // a missing nonce or a blocked inline style would log here — the shell test
  // asserts this stays empty (proves the §5.7 nonce + style-src posture).
  const cspErrors: string[] = []

  test.beforeAll(async ({ browser }) => {
    // axe-core/playwright requires an explicit browser context (not the
    // implicit one from browser.newPage()).
    const context = await browser.newContext()
    page = await context.newPage()
    page.on('console', (msg) => {
      const text = msg.text()
      if (/content security policy|content-security-policy/i.test(text)) {
        cspErrors.push(text)
      }
    })
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

  test('the workspace shell renders its landmarks', async () => {
    await gotoStable(page, '/me')
    await expect(page.getByRole('banner')).toBeVisible()
    await expect(page.locator('#main-content')).toBeVisible()
    await expect(page.getByRole('contentinfo')).toBeVisible()
    // Sidebar brand + user menu trigger are present.
    await expect(page.getByRole('banner').getByRole('button', { name: /toggle sidebar/i })).toBeVisible()
  })

  test('sidebar open/closed state survives a reload (cookie)', async () => {
    await gotoStable(page, '/me')

    function sidebarStateCookie(cookies: { name: string; value: string }[]) {
      return cookies.find((c) => c.name === 'sidebar_state')?.value
    }

    await page.getByRole('banner').getByRole('button', { name: /toggle sidebar/i }).click()
    // Let the cookie write settle.
    await page.waitForTimeout(200)
    const afterToggle = sidebarStateCookie(await page.context().cookies())
    expect(afterToggle).toBeDefined()

    await gotoStable(page, '/me')
    const afterReload = sidebarStateCookie(await page.context().cookies())
    expect(afterReload).toBe(afterToggle)
  })

  test('Cmd/Ctrl+K opens the command palette', async () => {
    await gotoStable(page, '/me')
    // Wait for the palette trigger to mount — proves React has hydrated and
    // the keydown listener in <CommandPalette> is attached. Without this the
    // press can fire before useEffect runs (gotoStable resolves at navigation
    // commit, not load).
    const trigger = page.getByRole('button', { name: /search and commands/i })
    await expect(trigger).toBeVisible()

    // Ctrl+K is a browser-reserved shortcut (focus address bar) so
    // page.keyboard.press can be intercepted by Chromium before reaching the
    // page's keydown listener. Dispatch the event directly on the document —
    // this fires only the JS handler in <CommandPalette>, which is what the
    // test is meant to verify.
    await page.evaluate(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'k',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      )
    })
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByPlaceholder(/command or search/i)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('theme choice persists across a reload', async () => {
    await gotoStable(page, '/me')
    await page.getByRole('button', { name: /toggle theme/i }).click()
    await page.getByRole('menuitem', { name: /dark/i }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)

    await gotoStable(page, '/me')
    await expect(page.locator('html')).toHaveClass(/dark/)
  })

  test('skip link moves focus to the main content', async () => {
    await gotoStable(page, '/me')
    await page.locator('body').click({ position: { x: 1, y: 1 } })
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: /skip to main content/i })
    await expect(skip).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('#main-content')).toBeFocused()
  })

  test('/me/access-log renders and is axe-clean', async () => {
    await gotoStable(page, '/me/access-log')
    await expect(
      page.getByRole('heading', { level: 1, name: /my access log/i }),
    ).toBeVisible()
    const results = await new AxeBuilder({ page })
      .withTags([...AXE_TAGS])
      .options({ rules: AXE_RULES })
      .analyze()
    expect(results.violations).toEqual([])
  })

  test('no CSP violations surfaced while using the shell', () => {
    // Accumulated across the shell tests above under the enforcing prod CSP.
    expect(cspErrors).toEqual([])
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
