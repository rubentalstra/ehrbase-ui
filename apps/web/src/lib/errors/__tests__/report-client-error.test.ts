import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the toast so we can assert a single generic message is shown and never
// the raw error text (docs/architecture.md §10 rule 1).
const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    error: (msg: string) => {
      toastError(msg)
    },
  },
}))

import { reportClientError } from '@/lib/errors/report-client-error'

type Envelope = { correlationId?: string; code?: string; message: string }

describe('reportClientError', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    toastError.mockClear()
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function lastCall(): { url: unknown; body: Envelope } {
    const call = fetchMock.mock.calls.at(-1)
    expect(call).toBeDefined()
    const init = call![1] as { body: string }
    const body = JSON.parse(init.body) as Envelope
    return { url: call![0], body }
  }

  it('mints a correlationId, posts a sanitized envelope, and toasts once', () => {
    const id = reportClientError(new Error('boom'))

    expect(id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const { url, body } = lastCall()
    expect(url).toBe('/api/log/client-error')
    expect(body).toEqual({ correlationId: id, code: 'Error', message: 'boom' })

    // Exactly one generic toast — not the raw error string.
    expect(toastError).toHaveBeenCalledTimes(1)
    expect(toastError.mock.calls.at(-1)?.[0]).not.toContain('boom')
  })

  it('uses a caller-provided correlationId (stable boundary id)', () => {
    const id = reportClientError(new Error('x'), 'fixed-id-123')
    expect(id).toBe('fixed-id-123')
    expect(lastCall().body.correlationId).toBe('fixed-id-123')
  })

  it('truncates the message to 500 characters', () => {
    reportClientError(new Error('a'.repeat(5000)))
    expect(lastCall().body.message).toHaveLength(500)
  })

  it('handles non-Error throwables without a code', () => {
    reportClientError('just a string')
    const { body } = lastCall()
    expect(body.code).toBeUndefined()
    expect(body.message).toBe('just a string')
  })
})
