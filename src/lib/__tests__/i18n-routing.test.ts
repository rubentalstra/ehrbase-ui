// i18n URL-routing machinery (docs/architecture.md §11.4). The router's
// rewrite uses Paraglide's localizeUrl/deLocalizeUrl. English-only today, the
// base locale is unprefixed, so both are pass-throughs — this pins that
// behaviour so a future Dutch addition can't silently start rewriting English
// URLs.

import { describe, expect, it } from 'vitest'

import { deLocalizeUrl, localizeUrl } from '@/paraglide/runtime.js'

describe('i18n URL rewrite (English-only base)', () => {
  const paths = ['/', '/me', '/me/access-log', '/accessibility']

  it('leaves the base-locale path unprefixed through localizeUrl', () => {
    for (const path of paths) {
      const out = localizeUrl(new URL(`http://localhost:3000${path}`))
      expect(new URL(out).pathname).toBe(path)
    }
  })

  it('de-localizes back to the same path', () => {
    for (const path of paths) {
      const out = deLocalizeUrl(new URL(`http://localhost:3000${path}`))
      expect(new URL(out).pathname).toBe(path)
    }
  })

  it('round-trips localize → delocalize to the original path', () => {
    for (const path of paths) {
      const localized = localizeUrl(new URL(`http://localhost:3000${path}`))
      const back = deLocalizeUrl(new URL(localized))
      expect(new URL(back).pathname).toBe(path)
    }
  })
})
