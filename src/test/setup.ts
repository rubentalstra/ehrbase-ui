// Default env so server-only modules (which assert their config at import)
// can be imported in unit tests without a live stack. Tests that exercise
// Valkey/DB behavior mock those clients explicitly.
process.env.VALKEY_URL ??= 'redis://localhost:6379'
process.env.AUDIT_PSEUDONYM_SECRET ??= 'test-pseudonym-secret'
process.env.AUDIT_DB_URL ??= 'postgres://audit_writer:audit_writer@localhost:5432/audit'
process.env.AUDIT_DB_OWNER_URL ??= 'postgres://audit_owner:audit_owner@localhost:5432/audit'
process.env.KEYCLOAK_ISSUER_URL ??= 'http://localhost:8180/realms/ehrbase'
process.env.KEYCLOAK_CLIENT_ID ??= 'ehrbase-ui'
process.env.KEYCLOAK_CLIENT_SECRET ??= 'dev-only-rotate-in-prod'
process.env.KEYCLOAK_REDIRECT_URI ??= 'http://localhost:3000/api/auth/callback'

import '@testing-library/jest-dom/vitest'
import * as matchers from 'vitest-axe/matchers'
import { expect, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

expect.extend(matchers)

afterEach(() => {
  cleanup()
})
