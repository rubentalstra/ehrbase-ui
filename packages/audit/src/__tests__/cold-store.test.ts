// Unit tests for the cold-store layer (ADR-0027).
//
// Hits pure helpers (objectKeyFor + retainUntilDateFor) directly and the
// factory's env-driven selection via _resetColdStorageProviderForTests.
// The full archive() / verify() round-trip is covered by the gated
// E2E_FULL_STACK integration test (PR-B verification §4).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  NoopColdStore,
  objectKeyFor,
  retainUntilDateFor,
} from '../cold-store.server.ts'
import {
  _resetColdStorageProviderForTests,
  getColdStorageProvider,
} from '../cold-store.factory.server.ts'
import type { AuditEventRow } from '../schema.ts'

function rowAt(
  timestamp: string,
  eventId = '11111111-1111-1111-1111-111111111111',
): AuditEventRow {
  return {
    eventId,
    timestamp,
    actorUserId: 'u1',
    actorUsername: 'u1@x',
    actorDisplayName: 'U1',
    actorRoles: ['clinician'],
    actorOrganization: null,
    actorOnBehalfOf: null,
    sourceIpAddress: '127.0.0.1',
    sourceUserAgent: 'test',
    sourceSessionId: 's1',
    sourceCorrelationId: '22222222-2222-2222-2222-222222222222',
    action: 'READ',
    targetEhrId: null,
    targetSubjectIdHash: null,
    targetResourceType: 'EHR',
    targetResourceId: null,
    targetArchetypeId: null,
    purpose: 'TREATMENT',
    outcome: 'SUCCESS',
    outcomeDetail: null,
    retentionPolicy: 'AUDIT_LOG',
    s3ArchivedAt: null,
    previousHash: null,
    hash: 'deadbeef',
  }
}

describe('objectKeyFor', () => {
  it('lays the key out as audit/yyyy/mm/dd/<id>.json (UTC)', () => {
    expect(
      objectKeyFor({ eventId: 'abc', timestamp: '2026-05-28T13:45:00.000Z' }),
    ).toBe('audit/2026/05/28/abc.json')
  })
  it('zero-pads month + day', () => {
    expect(
      objectKeyFor({ eventId: 'x', timestamp: '2026-01-09T00:00:00.000Z' }),
    ).toBe('audit/2026/01/09/x.json')
  })
})

describe('retainUntilDateFor', () => {
  it('AUDIT_LOG → +10y', () => {
    const d = retainUntilDateFor({
      timestamp: '2026-05-28T00:00:00.000Z',
      retentionPolicy: 'AUDIT_LOG',
    })
    expect(d.getUTCFullYear()).toBe(2036)
  })
  it('CLINICAL_RECORD → +20y', () => {
    const d = retainUntilDateFor({
      timestamp: '2026-05-28T00:00:00.000Z',
      retentionPolicy: 'CLINICAL_RECORD',
    })
    expect(d.getUTCFullYear()).toBe(2046)
  })
  it('SESSION → +1y (cold tier outlives the warm 2-day cutoff)', () => {
    const d = retainUntilDateFor({
      timestamp: '2026-05-28T00:00:00.000Z',
      retentionPolicy: 'SESSION',
    })
    expect(d.getUTCFullYear()).toBe(2027)
  })
})

describe('getColdStorageProvider factory', () => {
  const originalEnv = { ...process.env }
  beforeEach(() => {
    _resetColdStorageProviderForTests()
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
  })
  afterEach(() => {
    process.env = { ...originalEnv }
    _resetColdStorageProviderForTests()
    vi.restoreAllMocks()
  })

  it('defaults to NoopColdStore when COLD_STORAGE_PROVIDER unset', () => {
    delete process.env.COLD_STORAGE_PROVIDER
    expect(getColdStorageProvider()).toBeInstanceOf(NoopColdStore)
  })

  it('selects NoopColdStore when COLD_STORAGE_PROVIDER=none', () => {
    process.env.COLD_STORAGE_PROVIDER = 'none'
    expect(getColdStorageProvider()).toBeInstanceOf(NoopColdStore)
  })

  it('logs the cold-tier mode on construction (visibility contract)', () => {
    const spy = vi.spyOn(console, 'info')
    process.env.COLD_STORAGE_PROVIDER = 'none'
    getColdStorageProvider()
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('cold-tier mode: best-effort'),
    )
  })

  it('refuses an unknown provider name', () => {
    process.env.COLD_STORAGE_PROVIDER = 'garbage'
    expect(() => getColdStorageProvider()).toThrow(/COLD_STORAGE_PROVIDER/)
  })

  it('requires endpoint for seaweedfs', () => {
    process.env.COLD_STORAGE_PROVIDER = 'seaweedfs'
    process.env.COLD_STORAGE_ACCESS_KEY = 'a'
    process.env.COLD_STORAGE_SECRET_KEY = 'b'
    delete process.env.COLD_STORAGE_ENDPOINT
    expect(() => getColdStorageProvider()).toThrow(/COLD_STORAGE_ENDPOINT/)
  })

  it('requires credentials for any non-none provider', () => {
    process.env.COLD_STORAGE_PROVIDER = 'aws'
    delete process.env.COLD_STORAGE_ACCESS_KEY
    delete process.env.COLD_STORAGE_SECRET_KEY
    expect(() => getColdStorageProvider()).toThrow(/COLD_STORAGE_ACCESS_KEY/)
  })
})

describe('NoopColdStore', () => {
  it('verify returns true and archive returns the canonical key', async () => {
    const noop = new NoopColdStore()
    const key = await noop.archive(rowAt('2026-05-28T01:02:03.000Z'))
    expect(key).toBe(
      'audit/2026/05/28/11111111-1111-1111-1111-111111111111.json',
    )
    expect(await noop.verify('11111111-1111-1111-1111-111111111111', key)).toBe(
      true,
    )
  })
})
