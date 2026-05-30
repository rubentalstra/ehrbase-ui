// Default env so server-only modules (which assert their config at import)
// can be imported in unit tests without a live stack. Tests that exercise
// Valkey/DB behavior mock those clients explicitly.
process.env.VALKEY_URL ??= 'redis://localhost:6379'
// Demographic identifier pseudonymisation HMAC key (demographic-core, rule 12).
process.env.AUDIT_PSEUDONYM_SECRET ??= 'test-pseudonym-secret'
// Draft-at-rest encryption key (field-encryption.server.ts).
process.env.DRAFT_ENCRYPTION_SECRET ??= 'test-draft-encryption-secret'
process.env.KEYCLOAK_ISSUER_URL ??= 'http://localhost:8180/realms/ehrbase'
process.env.KEYCLOAK_CLIENT_ID ??= 'ehrbase-ui'
process.env.KEYCLOAK_CLIENT_SECRET ??= 'dev-only-rotate-in-prod'
process.env.KEYCLOAK_REDIRECT_URI ??= 'http://localhost:3000/api/auth/callback'

import '@testing-library/jest-dom/vitest'
import * as matchers from 'vitest-axe/matchers'
import { expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom has no matchMedia; next-themes (and other media-query consumers) need
// it. Default to "no preference" so theme components mount in tests.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  })
}

expect.extend(matchers)

afterEach(() => {
  cleanup()
})
