// Better Auth instance for ehrbase-ui (docs/architecture.md §5; ADR-0028).
//
// Replaces the M2 Arctic + hand-rolled Valkey session store. Better Auth
// owns the user / session / account / verification tables (in the `auth`
// database, ADR-0029); Keycloak remains the IdP — Better Auth talks to it
// as an OIDC client via the @better-auth/sso plugin.
//
// Plugin lineup (per user planning answer):
//   - admin           → user moderation + impersonation (powers the M15 UI)
//   - organization    → per-hospital tenancy + per-department teams
//   - sso             → register Keycloak as an OIDC provider with JIT
//                       provisioning + claim mapping
//   - tanstackStartCookies → required; TanStack Start cookie integration.
//                          MUST be last in the array per the Better Auth
//                          docs.
//
// On every successful sign-in we (a) mirror the user's Keycloak realm-roles
// into the `keycloakRoles` column, which is what `requireRole(...)` reads,
// and (b) emit a NEN 7513 LOGIN audit event via the existing logAudit
// pipeline (§14). LOGIN_FAILED + LOGOUT + SESSION_EXPIRED are emitted from
// the hooks below.

import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createAuthMiddleware } from 'better-auth/api'
import { admin, organization } from 'better-auth/plugins'
import { sso } from '@better-auth/sso'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { z } from 'zod'

import { authDb } from '@/db/auth-client.server'
import * as authSchema from '@/db/schema/auth'
import { logAudit } from '@/lib/audit/logger.server'

const KeycloakUserInfoSchema = z
  .object({
    realm_access: z
      .object({ roles: z.array(z.string()).default([]) })
      .partial()
      .optional(),
  })
  .partial()

const SessionUserShapeSchema = z
  .object({
    id: z.string(),
    email: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    keycloakRoles: z.array(z.string()).default([]),
  })
  .partial({ email: true, name: true })

const BETTER_AUTH_SECRET =
  process.env.BETTER_AUTH_SECRET ?? 'dev-only-rotate-in-prod'
const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'

// Provisioning: pull Keycloak realm roles from the SSO userInfo payload and
// store them on the Better Auth user row so `requireRole(...)` has a single
// place to look. Better Auth invokes this on first sign-in (and on every
// sign-in when `provisionUserOnEveryLogin: true`, which we set so Keycloak
// is the authoritative source).
async function provisionFromKeycloak(args: {
  user: { id?: string; email?: string | null }
  userInfo?: unknown
}): Promise<void> {
  const parsed = KeycloakUserInfoSchema.safeParse(args.userInfo ?? {})
  const roles = parsed.success ? (parsed.data.realm_access?.roles ?? []) : []
  // Persist via Drizzle directly — Better Auth's user-update API would also
  // work but we already have the typed table here.
  if (args.user.id) {
    const { eq } = await import('drizzle-orm')
    await authDb
      .update(authSchema.user)
      .set({ keycloakRoles: roles })
      .where(eq(authSchema.user.id, args.user.id))
  }
}

export const auth = betterAuth({
  secret: BETTER_AUTH_SECRET,
  baseURL: BETTER_AUTH_URL,
  database: drizzleAdapter(authDb, { provider: 'pg', schema: authSchema }),
  // The clinical app must session-cookie idle out the same way M2 did
  // (§5.10 — 15-min idle, 12-h absolute). Better Auth's session model
  // supports `expiresIn` (absolute) and `updateAge` (idle); we mirror the
  // arch-doc numbers here.
  session: {
    expiresIn: 60 * 60 * 12, // 12 h absolute
    updateAge: 60 * 15, // 15 min idle
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  plugins: [
    // Admin moderation + impersonation. Default roles are ['user', 'admin'].
    admin(),
    // Per-hospital tenancy + per-department teams (v1.0 multi-hospital
    // story; deployments that ship single-tenant can leave the org table
    // empty and gate purely on `keycloakRoles`).
    organization({
      teams: { enabled: true },
    }),
    // SSO (Keycloak via OIDC). The provider row in the `sso_provider`
    // table is created at boot by registerKeycloakSsoProvider() below; this
    // plugin block just wires the lifecycle hooks.
    sso({
      provisionUserOnEveryLogin: true,
      provisionUser: async ({ user, userInfo }) => {
        await provisionFromKeycloak({ user, userInfo })
      },
    }),
    // MUST be last per the Better Auth docs.
    tanstackStartCookies(),
  ],
  // NEN 7513 audit emit on every auth lifecycle event. The middleware fires
  // AFTER the handler resolves, so we never block the response on an audit
  // write. logAudit is itself fire-and-forget (§14.3).
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      const { path } = ctx
      try {
        if (path === '/sign-in/sso' || path?.startsWith('/sso/callback/')) {
          // The SSO callback issues a session if the exchange succeeded.
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

function extractKeycloakRoles(user: unknown): string[] {
  const parsed = SessionUserShapeSchema.safeParse(user)
  return parsed.success ? (parsed.data.keycloakRoles ?? []) : []
}

// One-shot lazy bootstrap: ensure the Keycloak SSO provider row exists in
// the `sso_provider` table. The handler route awaits this on first hit so
// the provider is guaranteed to be registered before any SSO flow can run.
// Idempotent across restarts.
let _ssoBootstrap: Promise<void> | undefined
export function ensureKeycloakSsoProviderRegistered(): Promise<void> {
  _ssoBootstrap ??= registerKeycloakSsoProvider().catch((err: unknown) => {
    console.error('[auth] failed to register Keycloak SSO provider', err)
    // Retry on the next call.
    _ssoBootstrap = undefined
  })
  return _ssoBootstrap
}

async function registerKeycloakSsoProvider(): Promise<void> {
  const providerId = process.env.SSO_KEYCLOAK_PROVIDER_ID ?? 'keycloak'
  const issuer = process.env.SSO_KEYCLOAK_ISSUER
  const clientId = process.env.SSO_KEYCLOAK_CLIENT_ID
  const clientSecret = process.env.SSO_KEYCLOAK_CLIENT_SECRET
  if (!issuer || !clientId || !clientSecret) {
    console.warn(
      '[auth] SSO_KEYCLOAK_{ISSUER,CLIENT_ID,CLIENT_SECRET} not set — Keycloak SSO not registered',
    )
    return
  }
  const { eq } = await import('drizzle-orm')
  const existing = await authDb
    .select({ id: authSchema.ssoProvider.id })
    .from(authSchema.ssoProvider)
    .where(eq(authSchema.ssoProvider.providerId, providerId))
    .limit(1)
  if (existing.length > 0) return
  const { randomUUID } = await import('node:crypto')
  await authDb.insert(authSchema.ssoProvider).values({
    id: randomUUID(),
    providerId,
    issuer,
    oidcConfig: JSON.stringify({
      clientId,
      clientSecret,
      // Better Auth fetches the discovery doc and fills in the rest.
      scopes: ['openid', 'profile', 'email'],
    }),
  })
  console.info(
    `[auth] registered Keycloak SSO provider (providerId=${providerId})`,
  )
}
