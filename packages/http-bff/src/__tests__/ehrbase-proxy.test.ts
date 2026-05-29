import { describe, expect, it } from 'vitest'

import { classifyRequest, extractEhrId } from '../ehrbase-proxy.server.ts'

describe('classifyRequest', () => {
  it('classifies AQL queries with the strict limit', () => {
    expect(classifyRequest('POST', 'query/aql')).toEqual({
      rateLimit: 'aql',
      action: 'QUERY',
      resourceType: 'QUERY',
    })
  })

  it('classifies reads', () => {
    const c = classifyRequest('GET', 'ehr/abc/composition/123')
    expect(c.rateLimit).toBe('read')
    expect(c.action).toBe('READ')
    expect(c.resourceType).toBe('COMPOSITION')
  })

  it('classifies composition writes', () => {
    expect(classifyRequest('POST', 'ehr/abc/composition')).toMatchObject({
      rateLimit: 'composition-write',
      action: 'CREATE',
      resourceType: 'COMPOSITION',
    })
    expect(classifyRequest('PUT', 'ehr/abc/composition/1')).toMatchObject({ action: 'UPDATE' })
    expect(classifyRequest('DELETE', 'ehr/abc/composition/1')).toMatchObject({ action: 'DELETE' })
  })

  it('maps EHR and template resource types', () => {
    expect(classifyRequest('GET', 'ehr/abc').resourceType).toBe('EHR')
    expect(classifyRequest('GET', 'definition/template/adl1.4').resourceType).toBe('TEMPLATE')
  })
})

describe('extractEhrId', () => {
  it('pulls the UUID out of an /ehr/{id} path', () => {
    expect(extractEhrId('ehr/7d44b88c-4199-4bad-9765-5f24f4f3a3a4/composition')).toBe(
      '7d44b88c-4199-4bad-9765-5f24f4f3a3a4',
    )
  })

  it('returns undefined when no EHR id is present', () => {
    expect(extractEhrId('query/aql')).toBeUndefined()
  })
})
