// Liveness + readiness endpoint E2E (docs/architecture.md §13.4).
//
// Runs against `pnpm dev` (the default Playwright webServer). Doesn't need
// the full Docker compose stack — `/api/health` is liveness-only, and the
// /api/ready probes degrade to 'fail' when dependencies aren't reachable
// (which is what we expect in the dev-server-only mode the fast Playwright
// suite uses). The full-stack E2E exercises the happy-path /api/ready.

import { expect, test } from '@playwright/test'

test.describe('Observability endpoints (§13.4)', () => {
  test('GET /api/health returns 200 "ok"', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)
    expect(await res.text()).toBe('ok')
    expect(res.headers()['content-type']).toContain('text/plain')
    expect(res.headers()['cache-control']).toBe('no-store')
  })

  test('GET /api/ready returns a JSON envelope with all 5 subsystem keys', async ({
    request,
  }) => {
    const res = await request.get('/api/ready')
    // Status will be 200 (full stack up) or 503 (dev-only — Valkey + the
    // databases unreachable). Either way the envelope shape is fixed.
    expect([200, 503]).toContain(res.status())
    expect(res.headers()['content-type']).toContain('application/json')
    expect(res.headers()['cache-control']).toBe('no-store')

    const body = (await res.json()) as {
      status: string
      checks: Record<string, string>
    }
    expect(['ready', 'not_ready']).toContain(body.status)
    expect(Object.keys(body.checks).sort()).toEqual([
      'audit_db',
      'auth_db',
      'ehrbase',
      'keycloak',
      'valkey',
    ])
    // CLAUDE.md Inviolable rule 2 — no raw error text in the body.
    const raw = JSON.stringify(body)
    expect(raw).not.toMatch(/ECONNREFUSED|password=|secret=/i)
  })
})
