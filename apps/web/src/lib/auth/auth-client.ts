// Browser-side Better Auth client (https://better-auth.com/docs/integrations/tanstack).
//
// Components import `authClient` to start the SSO sign-in flow, sign out,
// list organizations, and call the admin/org plugin endpoints. Server code
// uses `auth.api.*` instead.
//
// Plugin clients mirror the server-side `auth.server.ts` config: SSO for
// Keycloak, admin + organization for the M15 admin/multi-hospital surfaces.

import { adminClient, organizationClient } from 'better-auth/client/plugins'
import { ssoClient } from '@better-auth/sso/client'
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  // Browser-side: default to current origin so the same bundle works in
  // dev (localhost:3000) and prod (https://...).
  baseURL: typeof window !== 'undefined' ? window.location.origin : undefined,
  plugins: [ssoClient(), adminClient(), organizationClient()],
})
