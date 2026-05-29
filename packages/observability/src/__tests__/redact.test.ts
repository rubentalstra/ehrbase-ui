// PHI redaction unit tests — exercises the in-process layers 1 + 2
// (docs/architecture.md §13.2). Layers 3 + 4 live in the collector config
// (apps/web/docker/otel/collector-config.yaml) and are validated by the
// E2E spans-no-phi.spec.ts.

import { describe, expect, it } from 'vitest'

import {
  isPhiAttributeKey,
  redactAttributeValue,
  redactHttpRequestPath,
  redactUuidsInString,
} from '../otel/redact.ts'

describe('redactHttpRequestPath — layer 1 (SDK requestHook)', () => {
  it('strips the query string', () => {
    expect(redactHttpRequestPath('/api/foo?subjectId=BSN123&token=abc')).toBe(
      '/api/foo',
    )
  })

  it('replaces UUIDs in the path with :id', () => {
    expect(
      redactHttpRequestPath(
        '/api/ehrbase/ehr/550e8400-e29b-41d4-a716-446655440000/composition',
      ),
    ).toBe('/api/ehrbase/ehr/:id/composition')
  })

  it('handles paths with multiple UUIDs', () => {
    expect(
      redactHttpRequestPath(
        '/api/ehrbase/ehr/550e8400-e29b-41d4-a716-446655440000/composition/11111111-2222-3333-4444-555555555555',
      ),
    ).toBe('/api/ehrbase/ehr/:id/composition/:id')
  })

  it('leaves UUID-free paths alone', () => {
    expect(redactHttpRequestPath('/api/health')).toBe('/api/health')
  })

  it('returns empty string for empty input', () => {
    expect(redactHttpRequestPath('')).toBe('')
  })

  it('combines query stripping + UUID replacement', () => {
    expect(
      redactHttpRequestPath(
        '/api/ehr/550e8400-e29b-41d4-a716-446655440000?bsn=123',
      ),
    ).toBe('/api/ehr/:id')
  })
})

describe('isPhiAttributeKey — layer 2 (SpanProcessor block-list)', () => {
  // Credentials & token-shaped keys.
  it.each([
    'password',
    'PASSWORD',
    'passwd',
    'token',
    'access_token',
    'refresh_token',
    'id_token',
    'authorization',
    'Authorization',
    'cookie',
    'Set-Cookie',
    'secret',
  ])('flags credential key %s', (key) => {
    expect(isPhiAttributeKey(key)).toBe(true)
  })

  it('flags direct PHI like email', () => {
    expect(isPhiAttributeKey('email')).toBe(true)
    expect(isPhiAttributeKey('EMAIL')).toBe(true)
  })

  // National patient identifiers — architecture.md §14.4 + §14.6 deployment
  // overlay. Each EU country's national identifier synonym.
  it.each(['bsn', 'niss', 'nir', 'kvnr', 'pesel', 'codice_fiscale', 'tis', 'nuts', 'bpk', 'mrn'])(
    'flags national patient identifier %s',
    (key) => {
      expect(isPhiAttributeKey(key)).toBe(true)
    },
  )

  it.each(['http.url.query', 'db.statement', 'request.body'])(
    'flags request-body / db-statement key %s',
    (key) => {
      expect(isPhiAttributeKey(key)).toBe(true)
    },
  )

  it('does NOT flag innocent keys', () => {
    expect(isPhiAttributeKey('http.method')).toBe(false)
    expect(isPhiAttributeKey('http.status_code')).toBe(false)
    expect(isPhiAttributeKey('http.route')).toBe(false)
    expect(isPhiAttributeKey('service.name')).toBe(false)
    expect(isPhiAttributeKey('span.kind')).toBe(false)
  })
})

describe('redactUuidsInString', () => {
  it('replaces all UUIDs in a free-form string', () => {
    const input =
      'span 550e8400-e29b-41d4-a716-446655440000 fetched composition 11111111-2222-3333-4444-555555555555'
    expect(redactUuidsInString(input)).toBe(
      'span :id fetched composition :id',
    )
  })

  it('is a no-op on UUID-free input', () => {
    expect(redactUuidsInString('hello world')).toBe('hello world')
  })
})

describe('redactAttributeValue', () => {
  it('strips UUIDs from string values', () => {
    expect(
      redactAttributeValue(
        '/api/ehr/550e8400-e29b-41d4-a716-446655440000',
      ),
    ).toBe('/api/ehr/:id')
  })

  it('returns non-string values unchanged', () => {
    expect(redactAttributeValue(42)).toBe(42)
    expect(redactAttributeValue(true)).toBe(true)
    expect(redactAttributeValue(null)).toBe(null)
  })
})
