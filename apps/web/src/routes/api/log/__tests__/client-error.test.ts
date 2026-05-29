import { describe, expect, it, vi } from 'vitest'

// Importing the route module pulls in server-only deps; stub them so the test
// doesn't open a Valkey connection or need the request context.
vi.mock('@ehrbase-ui/http-bff', () => ({ checkRateLimit: vi.fn() }))
vi.mock('@tanstack/react-start/server', () => ({ getRequestHeader: vi.fn() }))
vi.mock('@ehrbase-ui/observability/log', () => ({ withCorrelationId: vi.fn() }))

import { BodySchema } from '@/routes/api/log/client-error'

describe('client-error BodySchema (no-PHI / anti-flood bounds, §10)', () => {
  it('accepts a minimal valid envelope', () => {
    const r = BodySchema.safeParse({ message: 'render failed' })
    expect(r.success).toBe(true)
  })

  it('accepts a full valid envelope', () => {
    const r = BodySchema.safeParse({
      correlationId: '00000000-0000-4000-8000-000000000000',
      code: 'TypeError',
      message: 'x',
    })
    expect(r.success).toBe(true)
  })

  it('rejects a message over 500 characters (size cap)', () => {
    expect(BodySchema.safeParse({ message: 'a'.repeat(501) }).success).toBe(false)
  })

  it('rejects a code over 64 characters', () => {
    expect(
      BodySchema.safeParse({ code: 'c'.repeat(65), message: 'x' }).success,
    ).toBe(false)
  })

  it('rejects a non-uuid correlationId', () => {
    expect(
      BodySchema.safeParse({ correlationId: 'not-a-uuid', message: 'x' }).success,
    ).toBe(false)
  })

  it('rejects a missing message (required)', () => {
    expect(BodySchema.safeParse({ code: 'X' }).success).toBe(false)
  })

  it('strips unknown keys so arbitrary PHI fields cannot ride along', () => {
    const r = BodySchema.safeParse({ message: 'x', ehrId: 'secret', bsn: '123' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(Object.keys(r.data)).toEqual(['message'])
    }
  })
})
