// M7 admin-patients E2E (docs/CLINICAL-UI.md §4; ADR-0031/0041). Requires the
// live stack (Keycloak + EHRbase + Postgres + the dev server wired to them) and
// SEED_DEMO_DATA=true, so it is gated behind E2E_FULL_STACK=1 like auth.spec.ts.
//
// Logs in ONCE as dev-admin (the admin/patients surface is admin-gated; the
// realm has brute-force protection so we run serially + reuse one page), then
// asserts: the demo seed populated the list, a patient detail opens with the
// linked-EHR card, and the list is axe-clean (WCAG 2.2 AA).

import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

import { AXE_RULES, AXE_TAGS } from './axe-config'

const FULL_STACK = process.env.E2E_FULL_STACK === '1'

// `vite dev`'s module runner can 500 on the first eval of an SSR chunk; retry
// until non-5xx (same helper as auth.spec.ts).
async function gotoStable(page: Page, url: string): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await page.goto(url, { waitUntil: 'commit' })
      if (!res || res.status() < 500) return
    } catch {
      return
    }
    await page.waitForTimeout(1000)
  }
}

test.describe('Admin · Patients (M7)', () => {
  test.skip(!FULL_STACK, 'requires the full stack (E2E_FULL_STACK=1)')
  test.describe.configure({ mode: 'serial' })

  let page: Page

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext()
    page = await context.newPage()

    // SSO login as dev-admin (same flow as auth.spec.ts; admin role required).
    for (let attempt = 0; attempt < 6; attempt++) {
      const ssoResp = await page.request.post('/api/auth/sign-in/sso', {
        headers: { 'content-type': 'application/json' },
        data: { providerId: 'keycloak', callbackURL: '/admin/patients' },
      })
      if (ssoResp.status() < 500) {
        const body = (await ssoResp.json()) as { url?: string }
        if (body.url) {
          await page.goto(body.url)
          break
        }
      }
      await page.waitForTimeout(1000)
    }
    await page.fill('#username', 'dev-admin')
    await page.fill('#password', 'DevAdmin12345!')
    await page.click('#kc-login, [type="submit"]')
    await page.waitForURL('**/admin/patients')
    await gotoStable(page, '/admin/patients')
    await expect(page.getByRole('heading', { name: /patient management/i })).toBeVisible()
  })

  test.afterAll(async () => {
    await page.close()
  })

  test('the demo seed populated the patient list', async () => {
    // SEED_DEMO_DATA seeds "de Vries, Anna" et al. on the first list load.
    await expect(page.getByText(/de Vries/i)).toBeVisible()
  })

  test('opens a patient detail with the linked-EHR card', async () => {
    await page.getByRole('link', { name: /open/i }).first().click()
    await page.waitForURL(/\/admin\/patients\/[^/]+$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText(/linked ehr/i)).toBeVisible()
  })

  test('the patients list has no WCAG 2.2 AA violations', async () => {
    await gotoStable(page, '/admin/patients')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const results = await new AxeBuilder({ page })
      .withTags([...AXE_TAGS])
      .options({ rules: AXE_RULES })
      .analyze()
    expect(results.violations).toEqual([])
  })
})
