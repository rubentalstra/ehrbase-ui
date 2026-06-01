// Pure patient-identity helpers (ADR-0046): MRN extraction, age, sex, name.

import { type Party } from '@ehrbase-ui/demographic-core'
import { describe, expect, it } from 'vitest'

import {
  patientAge,
  patientDisplayName,
  patientMrn,
  patientSex,
} from '../patient-identity.ts'

function party(overrides: Partial<Party> = {}): Party {
  return {
    id: 'p1',
    active: true,
    version: 1,
    identifiers: [],
    names: [{ use: 'official', family: 'Janssen', given: ['Jan'], prefix: [], suffix: [] }],
    addresses: [],
    contacts: [],
    ...overrides,
  }
}

describe('patientMrn', () => {
  it('returns the active MRN value', () => {
    const p = party({ identifiers: [{ namespace: 'mrn', value: '0000042' }] })
    expect(patientMrn(p)).toBe('0000042')
  })
  it('ignores an ended MRN and returns null when none active', () => {
    const p = party({ identifiers: [{ namespace: 'mrn', value: 'OLD', end: '2020-01-01' }] })
    expect(patientMrn(p)).toBeNull()
  })
  it('returns null when there is no MRN', () => {
    const p = party({ identifiers: [{ namespace: 'nl-bsn', value: '999990019' }] })
    expect(patientMrn(p)).toBeNull()
  })
})

describe('patientAge', () => {
  it('is null for a missing or unparseable date', () => {
    expect(patientAge(undefined)).toBeNull()
    expect(patientAge('not-a-date')).toBeNull()
  })
  it('computes a plausible whole-years age from a full date', () => {
    const age = patientAge('2000-06-15')
    expect(typeof age).toBe('number')
    expect(age).toBeGreaterThan(20)
    expect(age).toBeLessThan(120)
  })
  it('handles a year-only (partial) date', () => {
    expect(patientAge('1990')).toBeGreaterThan(20)
  })
})

describe('patientSex / patientDisplayName', () => {
  it('returns the gender or null', () => {
    expect(patientSex(party({ gender: 'female' }))).toBe('female')
    expect(patientSex(party())).toBeNull()
  })
  it('renders Family, Given', () => {
    expect(patientDisplayName(party())).toBe('Janssen, Jan')
  })
})
