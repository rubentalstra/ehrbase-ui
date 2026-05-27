import { describe, expect, it } from 'vitest'

import { canonicalize, computeHash } from '@/lib/audit/hash-chain.server'
import type { AuditEventInsert } from '@/lib/audit/schema'

function baseEvent(overrides: Partial<Omit<AuditEventInsert, 'hash'>> = {}): Omit<
  AuditEventInsert,
  'hash'
> {
  return {
    eventId: '11111111-1111-1111-1111-111111111111',
    timestamp: '2026-05-27T10:00:00.000Z',
    actorUserId: 'user-1',
    actorUsername: 'dev-clinician',
    actorDisplayName: 'Dev Clinician',
    actorRoles: ['clinician'],
    actorOrganization: null,
    actorOnBehalfOf: null,
    sourceIpAddress: '127.0.0.1',
    sourceUserAgent: 'test',
    sourceSessionId: 'sess-1',
    sourceCorrelationId: '22222222-2222-2222-2222-222222222222',
    action: 'LOGIN',
    targetEhrId: null,
    targetSubjectIdHash: null,
    targetResourceType: 'SYSTEM',
    targetResourceId: null,
    targetArchetypeId: null,
    purpose: 'TREATMENT',
    lawfulBasis: '9(2)(h)',
    outcome: 'SUCCESS',
    outcomeDetail: null,
    previousHash: null,
    ...overrides,
  }
}

describe('canonicalize', () => {
  it('is independent of property insertion order', () => {
    const a = baseEvent()
    const reordered = Object.fromEntries(Object.entries(a).reverse())
    expect(canonicalize(reordered)).toBe(canonicalize(a))
  })
})

describe('computeHash', () => {
  it('is stable for identical content', () => {
    expect(computeHash(baseEvent())).toBe(computeHash(baseEvent()))
  })

  it('changes when any field changes', () => {
    const original = computeHash(baseEvent())
    expect(computeHash(baseEvent({ outcome: 'FAILURE' }))).not.toBe(original)
  })

  it('links a chain: tampering an earlier event breaks later hashes', () => {
    const first = baseEvent()
    const firstHash = computeHash(first)
    const second = baseEvent({
      eventId: '33333333-3333-3333-3333-333333333333',
      action: 'READ',
      previousHash: firstHash,
    })
    const secondHash = computeHash(second)

    // Tamper with the first event; recompute its hash.
    const tamperedFirstHash = computeHash(baseEvent({ outcomeDetail: 'tampered' }))
    expect(tamperedFirstHash).not.toBe(firstHash)

    // The second event still points at the ORIGINAL first hash, so the link
    // no longer matches the tampered event — detectable.
    expect(second.previousHash).toBe(firstHash)
    expect(second.previousHash).not.toBe(tamperedFirstHash)
    expect(secondHash).toBe(computeHash(second))
  })
})
