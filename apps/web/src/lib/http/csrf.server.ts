// CSRF defense (docs/architecture.md §5.8).
//
// Layered with the SameSite=Lax session cookie (the browser-level first line):
//   - Origin/Referer allow-list check on EVERY mutating request. A missing or
//     non-allow-listed Origin on a mutation is rejected.
//   - Single-use, session-bound, 5-min CSRF token for high-impact mutations
//     (template delete, role change, break-glass, audit-log export). Belt and
//     braces over the Origin check.

import { randomBytes } from 'node:crypto'

import { valkey } from '@ehrbase-ui/valkey'

const allowedOrigin = (() => {
  if (process.env.APP_PUBLIC_URL) return new URL(process.env.APP_PUBLIC_URL).origin
  if (process.env.KEYCLOAK_REDIRECT_URI) {
    return new URL(process.env.KEYCLOAK_REDIRECT_URI).origin
  }
  return 'http://localhost:3000'
})()

// True when the request's Origin (or Referer fallback) is allow-listed.
// Use for any state-changing request before acting on it.
export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (origin) return origin === allowedOrigin
  // Some browsers omit Origin on same-origin GET-like navigations but include
  // Referer; for mutations we still require one of them to match.
  const referer = request.headers.get('referer')
  if (referer) {
    try {
      return new URL(referer).origin === allowedOrigin
    } catch {
      return false
    }
  }
  return false
}

const tokenKey = (sid: string, token: string) => `csrf:${sid}:${token}`
const CSRF_TTL_SECONDS = 5 * 60

export async function issueCsrfToken(sid: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  await valkey.set(tokenKey(sid, token), '1', 'EX', CSRF_TTL_SECONDS)
  return token
}

// Single-use: a successful check deletes the token so it cannot be replayed.
export async function consumeCsrfToken(sid: string, token: string): Promise<boolean> {
  const deleted = await valkey.del(tokenKey(sid, token))
  return deleted === 1
}
