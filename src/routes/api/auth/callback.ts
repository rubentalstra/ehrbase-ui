// GET /api/auth/callback — finish the Authorization-Code + PKCE flow (§5.4).
//
// Validates the OAuth state against the pre-session, exchanges the code for
// tokens over the back-channel, reads identity + realm roles from the tokens,
// promotes the pre-session to a full authenticated session (tokens stay
// server-side), and audits the LOGIN. On any failure we audit LOGIN_FAILED
// and bounce to the home page with a PHI-free error flag.

import { createFileRoute, redirect } from '@tanstack/react-router'
import { getCookie, setCookie } from '@tanstack/react-start/server'

import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/cookie.server'
import { decodeClaims, keycloakServer } from '@/lib/auth/keycloak.server'
import { logAudit } from '@/lib/audit/logger.server'
import { readSession, writeSession } from '@/lib/session.server'

const ABSOLUTE_TIMEOUT_SECONDS = Number(
  process.env.SESSION_ABSOLUTE_TIMEOUT_SECONDS ?? 43200,
)

export const Route = createFileRoute('/api/auth/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams
        const code = params.get('code')
        const state = params.get('state')
        const sid = getCookie(SESSION_COOKIE)

        const fail = async (detail: string) => {
          await logAudit({
            actor: {
              userId: 'anonymous',
              username: 'anonymous',
              displayName: 'anonymous',
              roles: [],
            },
            action: 'LOGIN_FAILED',
            target: { resourceType: 'SYSTEM' },
            purpose: 'SYSTEM_ADMIN',
            outcome: 'FAILURE',
            outcomeDetail: detail,
            retentionPolicy: 'AUTH_LOG',
          })
          throw redirect({ href: '/?auth_error=1' })
        }

        if (!sid) return fail('no_presession')
        const pre = await readSession(sid)
        if (!pre || pre.status !== 'authenticating' || !pre.codeVerifier) {
          return fail('no_presession')
        }
        if (!code || !state || state !== pre.state) {
          return fail('state_mismatch')
        }

        const tokens = await keycloakServer.validateAuthorizationCode(
          code,
          pre.codeVerifier,
        )
        const accessToken = tokens.accessToken()
        const idToken = tokens.idToken()
        const claims = decodeClaims(accessToken, idToken)

        const now = Date.now()
        await writeSession(sid, {
          status: 'authenticated',
          userId: claims.userId,
          email: claims.email,
          name: claims.name,
          roles: claims.roles,
          accessToken,
          accessTokenExpiresAt: tokens.accessTokenExpiresAt().getTime(),
          refreshToken: tokens.hasRefreshToken()
            ? tokens.refreshToken()
            : undefined,
          idToken: tokens.idToken(),
          createdAt: now,
          lastSeenAt: now,
          emergencyAccessCount: 0,
        })

        setCookie(SESSION_COOKIE, sid, {
          ...sessionCookieOptions(),
          maxAge: ABSOLUTE_TIMEOUT_SECONDS,
        })

        await logAudit({
          actor: {
            userId: claims.userId,
            username: claims.username,
            displayName: claims.name,
            roles: claims.roles,
          },
          action: 'LOGIN',
          target: { resourceType: 'SYSTEM' },
          purpose: 'TREATMENT',
          outcome: 'SUCCESS',
          retentionPolicy: 'AUTH_LOG',
          source: { sessionId: sid },
        })

        throw redirect({ href: pre.postLoginRedirect ?? '/me' })
      },
    },
  },
})
