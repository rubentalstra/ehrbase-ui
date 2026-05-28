// Unit tests for the retention-cutoff helpers (ADR-0027 + §14.7).
//
// The full archive → verify → transactional delete loop in
// purgeExpiredAuditEvents lands in the gated E2E_FULL_STACK integration
// run; here we cover the pure cutoff math + env-override behaviour that
// drives it.

import { afterEach, describe, expect, it } from 'vitest'

import {
  cutoffDateFor,
  retentionCutoffDays,
} from '@/lib/audit/retention.server'

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('retentionCutoffDays', () => {
  it('defaults: CLINICAL_RECORD = 20y, AUDIT_LOG = 5y, AUTH_LOG = 1y, APP_LOG = 90d, SESSION = 2d', () => {
    delete process.env.AUDIT_RETENTION_DAYS_CLINICAL_RECORD
    delete process.env.AUDIT_RETENTION_DAYS_AUDIT_LOG
    delete process.env.AUDIT_RETENTION_DAYS_AUTH_LOG
    delete process.env.AUDIT_RETENTION_DAYS_APP_LOG
    delete process.env.AUDIT_RETENTION_DAYS_SESSION
    expect(retentionCutoffDays('CLINICAL_RECORD')).toBe(7300)
    expect(retentionCutoffDays('AUDIT_LOG')).toBe(1825)
    expect(retentionCutoffDays('AUTH_LOG')).toBe(365)
    expect(retentionCutoffDays('APP_LOG')).toBe(90)
    expect(retentionCutoffDays('SESSION')).toBe(2)
  })

  it('honours env override', () => {
    process.env.AUDIT_RETENTION_DAYS_AUDIT_LOG = '3650'
    expect(retentionCutoffDays('AUDIT_LOG')).toBe(3650)
  })

  it('rejects non-positive values', () => {
    process.env.AUDIT_RETENTION_DAYS_SESSION = '0'
    expect(() => retentionCutoffDays('SESSION')).toThrow(/positive/)
    process.env.AUDIT_RETENTION_DAYS_SESSION = '-1'
    expect(() => retentionCutoffDays('SESSION')).toThrow(/positive/)
    process.env.AUDIT_RETENTION_DAYS_SESSION = 'abc'
    expect(() => retentionCutoffDays('SESSION')).toThrow(/positive/)
  })
})

describe('cutoffDateFor', () => {
  it('subtracts the per-policy days from `now`', () => {
    const now = new Date('2026-05-28T00:00:00.000Z')
    // SESSION = 2 days → 2026-05-26
    expect(cutoffDateFor('SESSION', now).toISOString()).toBe(
      '2026-05-26T00:00:00.000Z',
    )
  })
  it('handles AUTH_LOG = 1y back', () => {
    const now = new Date('2026-05-28T00:00:00.000Z')
    expect(cutoffDateFor('AUTH_LOG', now).toISOString()).toBe(
      '2025-05-28T00:00:00.000Z',
    )
  })
})
