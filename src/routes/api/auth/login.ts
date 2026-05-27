// GET /api/auth/login — start the Authorization-Code + PKCE flow (§5.4).
//
// Generates state + a PKCE verifier, stashes them in a short-lived
// pre-session keyed by an httpOnly cookie, and redirects the browser to the
// EXTERNAL Keycloak authorization endpoint. No tokens exist yet.

import { createFileRoute, redirect } from '@tanstack/react-router'
import { setCookie } from '@tanstack/react-start/server'
import { generateCodeVerifier, generateState } from 'arctic'

import { keycloakBrowser, OIDC_SCOPES } from '@/lib/auth/keycloak.server'
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/cookie.server'
import { createSessionId, writeSession } from '@/lib/session.server'

export const Route = createFileRoute('/api/auth/login')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const state = generateState()
        const codeVerifier = generateCodeVerifier()
        const url = keycloakBrowser.createAuthorizationURL(state, codeVerifier, OIDC_SCOPES)

        // Only accept a local path as the post-login target — never an
        // absolute URL (open-redirect guard). Must start with a single '/'.
        const requested = new URL(request.url).searchParams.get('redirect')
        const postLoginRedirect =
          requested && /^\/(?!\/)/.test(requested) ? requested : '/me'

        const sid = createSessionId()
        await writeSession(sid, {
          status: 'authenticating',
          state,
          codeVerifier,
          postLoginRedirect,
        })

        // 10 minutes to complete login; replaced by the full-session cookie on
        // callback.
        setCookie(SESSION_COOKIE, sid, { ...sessionCookieOptions(), maxAge: 60 * 10 })

        throw redirect({ href: url.toString() })
      },
    },
  },
})
