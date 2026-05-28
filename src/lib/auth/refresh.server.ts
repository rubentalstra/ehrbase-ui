// Silent access-token refresh (docs/architecture.md §5.10).
//
// When the access token is within the refresh window (5 min) of expiry and a
// refresh token is held, exchange it for a fresh access token in the
// background so an active user is never interrupted. Audited as TOKEN_REFRESH.
// A failed refresh is non-fatal here — requireAuth's timeout checks still gate
// the session; the stale token simply won't be usable upstream.

import { logAudit } from '@/lib/audit/logger.server'
import { keycloakServer } from '@/lib/auth/keycloak.server'
import { writeSession, type SessionData } from '@/lib/session.server'

const REFRESH_WINDOW_MS = 5 * 60 * 1000

export async function refreshIfExpiring(
  sid: string,
  session: SessionData,
): Promise<SessionData> {
  const expiresAt = session.accessTokenExpiresAt
  if (!session.refreshToken || !expiresAt) return session
  if (expiresAt - Date.now() > REFRESH_WINDOW_MS) return session

  try {
    const tokens = await keycloakServer.refreshAccessToken(session.refreshToken)
    const updated: SessionData = {
      ...session,
      accessToken: tokens.accessToken(),
      accessTokenExpiresAt: tokens.accessTokenExpiresAt().getTime(),
      refreshToken: tokens.hasRefreshToken()
        ? tokens.refreshToken()
        : session.refreshToken,
    }
    await writeSession(sid, updated)

    await logAudit({
      actor: {
        userId: session.userId ?? 'unknown',
        username: session.email ?? 'unknown',
        displayName: session.name ?? 'unknown',
        roles: session.roles ?? [],
      },
      action: 'TOKEN_REFRESH',
      target: { resourceType: 'SYSTEM' },
      purpose: 'TREATMENT',
      outcome: 'SUCCESS',
      retentionPolicy: 'AUTH_LOG',
      source: { sessionId: sid },
    })

    return updated
  } catch {
    return session
  }
}
