// GET /api/auth/logout — destroy the session and end the Keycloak SSO session.
//
// Server-side session deletion is immediate (§5.10 — 0 s grace period), the
// cookie is expired, and the browser is sent to Keycloak's RP-initiated
// end-session endpoint so the SSO session is torn down too. Audited as LOGOUT.

import { createFileRoute, redirect } from '@tanstack/react-router'
import { deleteCookie, getCookie } from '@tanstack/react-start/server'

import { logAudit } from '@/lib/audit/logger.server'
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/cookie.server'
import { endSessionUrl } from '@/lib/auth/keycloak.server'
import { destroySession, readSession } from '@/lib/session.server'

const POST_LOGOUT_REDIRECT =
  process.env.KEYCLOAK_POST_LOGOUT_REDIRECT ?? 'http://localhost:3000/'

export const Route = createFileRoute('/api/auth/logout')({
  server: {
    handlers: {
      GET: async () => {
        const sid = getCookie(SESSION_COOKIE)
        if (!sid) throw redirect({ href: '/' })

        const session = await readSession(sid)
        const idToken = session?.idToken

        if (session?.status === 'authenticated') {
          await logAudit({
            actor: {
              userId: session.userId ?? 'unknown',
              username: session.email ?? 'unknown',
              displayName: session.name ?? 'unknown',
              roles: session.roles ?? [],
            },
            action: 'LOGOUT',
            target: { resourceType: 'SYSTEM' },
            purpose: 'TREATMENT',
            lawfulBasis: '9(2)(h)',
            outcome: 'SUCCESS',
            source: { sessionId: sid },
          })
        }

        await destroySession(sid)
        deleteCookie(SESSION_COOKIE, sessionCookieOptions())

        if (idToken) {
          throw redirect({ href: endSessionUrl(idToken, POST_LOGOUT_REDIRECT) })
        }
        throw redirect({ href: '/' })
      },
    },
  },
})
