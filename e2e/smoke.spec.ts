import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

import { AXE_RULES, AXE_TAGS } from './axe-config'

test.describe('Public home page', () => {
  test('renders without runtime errors', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('has no WCAG 2.2 AA / EN 301 549 violations', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    // Wait for the React-hydrated heading rather than networkidle —
    // TanStack devtools keeps a websocket open in dev so networkidle never resolves.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const results = await new AxeBuilder({ page })
      .withTags([...AXE_TAGS])
      .options({ rules: AXE_RULES })
      .analyze()

    expect(results.violations).toEqual([])
  })
})
