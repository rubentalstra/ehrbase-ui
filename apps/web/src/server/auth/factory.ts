// Better Auth instance factory (docs/architecture.md §5; ADR-0028).
//
// Framework-agnostic: the host application chooses which cookie plugin to
// hand in via `extraPlugins`. For TanStack Start that's
// `tanstackStartCookies()` from 'better-auth/tanstack-start' — and per the
// Better Auth docs that plugin MUST come last in the plugins array.
//
// On every successful sign-in we (a) mirror the user's Keycloak realm roles
// into the `keycloakRoles` column, which is what `requireRole(...)` reads,
// and (b) emit a NEN 7513 LOGIN audit event via the existing logAudit
// pipeline (§14). LOGIN_FAILED + LOGOUT + SESSION_EXPIRED are emitted from
// the hooks below.

import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createAuthMiddleware } from 'better-auth/api'
import { admin, organization } from 'better-auth/plugins'
import { sso } from '@better-auth/sso'

import { authDb } from '@/server/db/auth-client'
import * as authSchema from '@/server/db/auth'
import { logAudit } from '@/server/audit/runtime'

import { decodeJwtPayload, extractKeycloakRoles } from './jwt.ts'
import { provisionFromKeycloak } from './provision.ts'

export type BuildAuthOptions = {
  /** BETTER_AUTH_SECRET — must be ≥32 random chars in production. */
  secret: string
  /** Canonical app URL — used in OIDC redirects + cookie domain. */
  baseURL: string
  /**
   * Origins Better Auth should fetch OIDC discovery docs from. Pass the
   * deployment's Keycloak origins (internal + external) plus the app's
   * baseURL origin.
   */
  trustedOrigins: string[]
  /**
   * Framework-specific plugins (e.g. tanstackStartCookies). They are
   * appended LAST to the internal plugins list per the Better Auth docs.
   */
  extraPlugins?: BetterAuthOptions['plugins']
}

export function buildAuth(opts: BuildAuthOptions) {
  return betterAuth({
    secret: opts.secret,
    baseURL: opts.baseURL,
    trustedOrigins: opts.trustedOrigins,
    database: drizzleAdapter(authDb, { provider: 'pg', schema: authSchema }),
    // Mirror the §5.10 numbers: 15-min idle, 12-h absolute.
    session: {
      expiresIn: 60 * 60 * 12,
      updateAge: 60 * 15,
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },
    plugins: [
      // Admin moderation + impersonation. Default roles are ['user', 'admin'].
      admin(),
      // Per-hospital tenancy + per-department teams (v1.0 multi-hospital
      // story; deployments that ship single-tenant can leave the org table
      // empty and gate purely on `keycloakRoles`).
      organization({ teams: { enabled: true } }),
      // SSO (Keycloak via OIDC). The provider row in the `sso_provider`
      // table is created at boot by ensureKeycloakSsoProviderRegistered();
      // this plugin block just wires the lifecycle hooks.
      sso({
        provisionUserOnEveryLogin: true,
        provisionUser: async ({ user, userInfo, token }) => {
          await provisionFromKeycloak({
            user,
            userInfo,
            token: {
              accessToken: token?.accessToken,
              idToken: token?.idToken,
            },
          })
        },
      }),
      // Framework-specific plugins last (per Better Auth docs; tanstackStartCookies
      // must be the final plugin or cookie writes silently no-op).
      ...(opts.extraPlugins ?? []),
    ],
    // NEN 7513 audit emit on every auth lifecycle event. The middleware fires
    // AFTER the handler resolves, so we never block the response on an audit
    // write. logAudit is itself fire-and-forget (§14.3).
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        const { path } = ctx
        try {
          if (path === '/sign-in/sso' || path?.startsWith('/sso/callback/')) {
            const newSession = ctx.context.newSession
            if (newSession) {
              await logAudit({
                actor: {
                  userId: newSession.user.id,
                  username: newSession.user.email ?? newSession.user.id,
                  displayName:
                    newSession.user.name ?? newSession.user.email ?? '',
                  roles: extractKeycloakRoles(newSession.user),
                },
                action: 'LOGIN',
                target: { resourceType: 'SYSTEM' },
                purpose: 'TREATMENT',
                outcome: 'SUCCESS',
                retentionPolicy: 'AUTH_LOG',
                source: { sessionId: newSession.session.token },
              })
            }
          } else if (path === '/sign-out') {
            const session = ctx.context.session
            if (session) {
              await logAudit({
                actor: {
                  userId: session.user.id,
                  username: session.user.email ?? session.user.id,
                  displayName: session.user.name ?? '',
                  roles: extractKeycloakRoles(session.user),
                },
                action: 'LOGOUT',
                target: { resourceType: 'SYSTEM' },
                purpose: 'TREATMENT',
                outcome: 'SUCCESS',
                retentionPolicy: 'AUTH_LOG',
                source: { sessionId: session.session.token },
              })
            }
          }
        } catch (err) {
          console.error('[auth] audit emit in middleware failed', err)
        }
      }),
    },
  })
}

// Re-export decodeJwtPayload — break-glass + require-role use the same helper.
export { decodeJwtPayload, extractKeycloakRoles }
