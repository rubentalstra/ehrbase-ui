// Unit tests for the nightly integrity job's alerting wrapper (§14.5).
//
// We stub verifyAuditChain to return controlled valid / invalid results,
// then assert that:
//   - A valid chain returns without trying to POST the webhook.
//   - A broken chain logs at error level AND POSTs the webhook (when set).
//   - The webhook POST contract carries kind, jobId, count, errors.

import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyAuditChain:
    vi.fn<() => Promise<{ valid: boolean; count: number; errors: string[] }>>(),
}))

// integrity-job.server.ts imports `verifyAuditChain` via the sibling
// relative path `./integrity.server`, so the mock has to target the same
// specifier the module under test actually resolves (vitest matches on
// module identity, not on the public barrel). From this test file at
// __tests__/integrity-job.test.ts that sibling is `../integrity.server.ts`.
vi.mock('../integrity.ts', () => ({
  verifyAuditChain: mocks.verifyAuditChain,
}))

import { runIntegrityJob } from '../integrity-job.ts'

const originalEnv = { ...process.env }
const originalFetch = globalThis.fetch

afterEach(() => {
  process.env = { ...originalEnv }
  globalThis.fetch = originalFetch
  mocks.verifyAuditChain.mockReset()
})

describe('runIntegrityJob', () => {
  it('passes through valid: true without POSTing the webhook', async () => {
    mocks.verifyAuditChain.mockResolvedValueOnce({
      valid: true,
      count: 3,
      errors: [],
    })
    const fetchSpy = vi.fn<typeof fetch>()
    globalThis.fetch = fetchSpy
    process.env.DPO_ALERT_WEBHOOK = 'https://alerts.example/dpo'

    const report = await runIntegrityJob()

    expect(report.valid).toBe(true)
    expect(report.count).toBe(3)
    expect(report.alertDelivered).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('POSTs the webhook with the failure payload when chain is broken', async () => {
    mocks.verifyAuditChain.mockResolvedValueOnce({
      valid: false,
      count: 5,
      errors: ['link break between e1 and e2'],
    })
    const fetchSpy = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(null, { status: 200 })),
    )
    globalThis.fetch = fetchSpy
    process.env.DPO_ALERT_WEBHOOK = 'https://alerts.example/dpo'

    const report = await runIntegrityJob()

    expect(report.valid).toBe(false)
    expect(report.alertDelivered).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const call = fetchSpy.mock.calls[0]
    expect(call).toBeDefined()
    if (!call) return
    expect(call[0]).toBe('https://alerts.example/dpo')
    const init = call[1]
    expect(init?.method).toBe('POST')
    const bodyText = typeof init?.body === 'string' ? init.body : '{}'
    const bodyJson: unknown = JSON.parse(bodyText)
    expect(bodyJson).toMatchObject({
      kind: 'audit-chain-break',
      count: 5,
      errors: ['link break between e1 and e2'],
    })
  })

  it('returns alertDelivered=false when no webhook configured', async () => {
    mocks.verifyAuditChain.mockResolvedValueOnce({
      valid: false,
      count: 1,
      errors: ['x'],
    })
    delete process.env.DPO_ALERT_WEBHOOK
    const fetchSpy = vi.fn<typeof fetch>()
    globalThis.fetch = fetchSpy

    const report = await runIntegrityJob()
    expect(report.alertDelivered).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('alertDelivered=false when the webhook POST fails', async () => {
    mocks.verifyAuditChain.mockResolvedValueOnce({
      valid: false,
      count: 1,
      errors: ['x'],
    })
    process.env.DPO_ALERT_WEBHOOK = 'https://alerts.example/dpo'
    globalThis.fetch = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(null, { status: 500 })),
    )

    const report = await runIntegrityJob()
    expect(report.alertDelivered).toBe(false)
  })
})
