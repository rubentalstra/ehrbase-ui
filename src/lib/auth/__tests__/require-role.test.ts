import { beforeEach, describe, expect, it, vi } from 'vitest'

const { resolveAuth, logAudit } = vi.hoisted(() => ({
  resolveAuth: vi.fn(),
  logAudit: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/auth/require-auth.server', () => ({ resolveAuth }))
vi.mock('@/lib/audit/logger.server', () => ({ logAudit }))

import { requireRole } from '@/lib/auth/require-role.server'

function authWithRoles(roles: string[]) {
  return {
    sid: 'sess-1',
    accessToken: 'token',
    session: {},
    user: { id: 'u1', email: 'e', name: 'n', roles },
  }
}

describe('requireRole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows a user holding one of the required roles', async () => {
    resolveAuth.mockResolvedValue(authWithRoles(['clinician']))
    const auth = await requireRole(['clinician', 'admin'])
    expect(auth.user.roles).toContain('clinician')
    expect(logAudit).not.toHaveBeenCalled()
  })

  it('denies with 403 and audits ACCESS_DENIED', async () => {
    resolveAuth.mockResolvedValue(authWithRoles(['researcher']))
    await expect(requireRole(['admin'])).rejects.toMatchObject({ status: 403 })
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ACCESS_DENIED', outcome: 'FAILURE' }),
    )
  })

  it('advertises break-glass on PHI-route denials', async () => {
    resolveAuth.mockResolvedValue(authWithRoles(['admin']))
    try {
      await requireRole(['clinician'], { phi: true })
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(Response)
      if (err instanceof Response) {
        expect(err.status).toBe(403)
        expect(err.headers.get('break-glass')).toBe('available')
      }
    }
  })

  it('omits the break-glass hint on non-PHI denials', async () => {
    resolveAuth.mockResolvedValue(authWithRoles(['admin']))
    try {
      await requireRole(['clinician'])
      expect.unreachable('should have thrown')
    } catch (err) {
      if (err instanceof Response) {
        expect(err.headers.get('break-glass')).toBeNull()
      }
    }
  })
})
