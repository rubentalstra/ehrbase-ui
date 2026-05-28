// i18n URL-routing machinery (docs/architecture.md §11.4). Symmetric prefix
// scheme: every locale lives under its own /{locale}/... path, including the
// base locale. The router's `rewrite` uses these to translate between the
// public (localized) URL and the internal (bare) route — pins the contract so
// a future locale addition can't silently change English behaviour.

import { describe, expect, it } from 'vitest'

import { deLocalizeUrl, localizeUrl } from '@/paraglide/runtime.js'

const ROOT = 'http://localhost:3000'

describe('i18n URL rewrite (symmetric /en prefix)', () => {
  const bare = ['/', '/me', '/me/access-log', '/accessibility']

  it('localizes a bare path to /en/{path}', () => {
    for (const path of bare) {
      const out = localizeUrl(new URL(`${ROOT}${path}`))
      const expected = path === '/' ? '/en' : `/en${path}`
      expect(new URL(out).pathname).toBe(expected)
    }
  })

  it('de-localizes /en/{path} back to the bare path', () => {
    for (const path of bare) {
      const localized = path === '/' ? '/en' : `/en${path}`
      const out = deLocalizeUrl(new URL(`${ROOT}${localized}`))
      expect(new URL(out).pathname).toBe(path)
    }
  })

  it('round-trips bare → localize → delocalize back to the bare path', () => {
    for (const path of bare) {
      const localized = localizeUrl(new URL(`${ROOT}${path}`))
      const back = deLocalizeUrl(new URL(localized))
      expect(new URL(back).pathname).toBe(path)
    }
  })
})
