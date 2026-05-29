// Unit tests for the Valkey leader-elect lock helper (ADR-0026).
//
// We mock the shared valkey client so the test doesn't depend on a running
// Valkey. The contract under test:
//   - AUDIT_TASKS_DISABLED=true → skip without acquiring.
//   - SET NX EX returns 'OK'    → fn runs, lock released via the compare-and-
//                                 del Lua script with our token.
//   - SET NX EX returns null    → fn does NOT run, outcome 'already-held'.

import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  set: vi.fn<(...args: unknown[]) => Promise<string | null>>(),
  defineCommand: vi.fn(),
  releaseAuditLock: vi.fn<(...args: unknown[]) => Promise<number>>(),
}))

vi.mock('@ehrbase-ui/valkey', () => ({
  valkey: {
    set: mocks.set,
    defineCommand: mocks.defineCommand,
    releaseAuditLock: mocks.releaseAuditLock,
  },
}))

import { withTaskLock } from '../task-lock.ts'

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
  mocks.set.mockReset()
  mocks.releaseAuditLock.mockReset()
})

describe('withTaskLock', () => {
  it('skips when AUDIT_TASKS_DISABLED=true', async () => {
    process.env.AUDIT_TASKS_DISABLED = 'true'
    const fn = vi.fn(() => Promise.resolve('ran'))
    const outcome = await withTaskLock('integrity', 10, fn)
    expect(outcome).toEqual({ acquired: false, reason: 'kill-switched' })
    expect(fn).not.toHaveBeenCalled()
    expect(mocks.set).not.toHaveBeenCalled()
  })

  it('runs fn when SET NX EX returns OK and releases with compare-and-del', async () => {
    delete process.env.AUDIT_TASKS_DISABLED
    mocks.set.mockResolvedValueOnce('OK')
    mocks.releaseAuditLock.mockResolvedValueOnce(1)

    const outcome = await withTaskLock('integrity', 10, () =>
      Promise.resolve('done'),
    )

    expect(outcome).toEqual({ acquired: true, result: 'done' })
    // Acquire — `audit:task:integrity`, EX, 10, NX.
    expect(mocks.set).toHaveBeenCalledWith(
      'audit:task:integrity',
      expect.any(String),
      'EX',
      10,
      'NX',
    )
    // Release — same key, same token.
    expect(mocks.releaseAuditLock).toHaveBeenCalledTimes(1)
    const releaseCall = mocks.releaseAuditLock.mock.calls[0]
    const setCall = mocks.set.mock.calls[0]
    expect(releaseCall).toBeDefined()
    expect(setCall).toBeDefined()
    if (!releaseCall || !setCall) return
    expect(releaseCall[0]).toBe('audit:task:integrity')
    expect(releaseCall[1]).toBe(setCall[1])
  })

  it('skips fn when SET NX EX returns null (another instance is leader)', async () => {
    delete process.env.AUDIT_TASKS_DISABLED
    mocks.set.mockResolvedValueOnce(null)
    const fn = vi.fn(() => Promise.resolve('ran'))
    const outcome = await withTaskLock('purge', 10, fn)
    expect(outcome).toEqual({ acquired: false, reason: 'already-held' })
    expect(fn).not.toHaveBeenCalled()
    expect(mocks.releaseAuditLock).not.toHaveBeenCalled()
  })

  it('still releases the lock when fn throws', async () => {
    delete process.env.AUDIT_TASKS_DISABLED
    mocks.set.mockResolvedValueOnce('OK')
    mocks.releaseAuditLock.mockResolvedValueOnce(1)

    await expect(
      withTaskLock('integrity', 10, () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom')

    expect(mocks.releaseAuditLock).toHaveBeenCalledTimes(1)
  })
})
