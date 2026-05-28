// requireAuth — the parent of every protected path (docs/architecture.md
// §5.5, §5.10).
//
// resolveAuth() is the server-only primitive: read the sid cookie → load the
// session → enforce the idle (15 min) + absolute (12 h) timeouts → silently
// refresh the access token → slide the idle clock. It returns the full context
// INCLUDING the access token, for use by the BFF proxy and break-glass. On any
// failure it audits and throws a 401.
//
// requireAuth is the createServerFn wrapper exposed to routes/components: it
// runs resolveAuth server-side and returns ONLY the user (never tokens), so a
// route's beforeLoad can gate on it without leaking OAuth material to the
// client.

import { getCookie } from '@tanstack/react-start/server'

import { logAudit } from '@/lib/audit/logger.server'
import { SESSION_COOKIE } from '@/lib/auth/cookie.server'
import { refreshIfExpiring } from '@/lib/auth/refresh.server'
import {
  destroySession,
  readSession,
  writeSession,
  type SessionData,
} from '@/lib/session.server'

const IDLE_TIMEOUT_MS =
  Number(process.env.SESSION_IDLE_TIMEOUT_SECONDS ?? 900) * 1000
const ABSOLUTE_TIMEOUT_MS =
  Number(process.env.SESSION_ABSOLUTE_TIMEOUT_SECONDS ?? 43200) * 1000

export type AuthUser = {
  id: string
  email: string
  name: string
  roles: string[]
}

export type AuthContext = {
  sid: string
  user: AuthUser
  accessToken: string
  session: SessionData
}

function unauthorized(code: string): Response {
  return new Response(JSON.stringify({ code }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  })
}

function userOf(session: SessionData): AuthUser {
  return {
    id: session.userId ?? 'unknown',
    email: session.email ?? '',
    name: session.name ?? '',
    roles: session.roles ?? [],
  }
}

export async function resolveAuth(): Promise<AuthContext> {
  const sid = getCookie(SESSION_COOKIE)
  if (!sid) throw unauthorized('UNAUTHENTICATED')

  const session = await readSession(sid)
  if (!session || session.status !== 'authenticated') {
    throw unauthorized('UNAUTHENTICATED')
  }

  const now = Date.now()
  const idleExpired =
    session.lastSeenAt !== undefined &&
    now - session.lastSeenAt > IDLE_TIMEOUT_MS
  const absoluteExpired =
    session.createdAt !== undefined &&
    now - session.createdAt > ABSOLUTE_TIMEOUT_MS

  if (idleExpired || absoluteExpired) {
    await destroySession(sid)
    await logAudit({
      actor: {
        userId: session.userId ?? 'unknown',
        username: session.email ?? 'unknown',
        displayName: session.name ?? 'unknown',
        roles: session.roles ?? [],
      },
      action: 'SESSION_EXPIRED',
      target: { resourceType: 'SYSTEM' },
      purpose: 'TREATMENT',
      outcome: 'SUCCESS',
      outcomeDetail: absoluteExpired ? 'absolute_timeout' : 'idle_timeout',
      retentionPolicy: 'AUTH_LOG',
      source: { sessionId: sid },
    })
    throw unauthorized('SESSION_EXPIRED')
  }

  const refreshed = await refreshIfExpiring(sid, session)
  const slid: SessionData = { ...refreshed, lastSeenAt: now }
  await writeSession(sid, slid)

  if (!slid.accessToken) throw unauthorized('UNAUTHENTICATED')

  return {
    sid,
    user: userOf(slid),
    accessToken: slid.accessToken,
    session: slid,
  }
}
