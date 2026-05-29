import { describe, expect, it } from 'vitest'

import { pseudonymizeSubject } from '@/lib/audit/pseudonymize.server'

describe('pseudonymizeSubject', () => {
  it('is deterministic for the same subject', () => {
    expect(pseudonymizeSubject('999990123')).toBe(pseudonymizeSubject('999990123'))
  })

  it('produces different hashes for different subjects', () => {
    expect(pseudonymizeSubject('999990123')).not.toBe(pseudonymizeSubject('999990124'))
  })

  it('does not echo the raw identifier', () => {
    const bsn = '999990123'
    const hash = pseudonymizeSubject(bsn)
    expect(hash).not.toContain(bsn)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })
})
