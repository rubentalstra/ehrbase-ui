// /api/auth/$ — Better Auth catch-all (docs/architecture.md §5; ADR-0044).
//
// Better Auth dispatches every supported path (sign-in/* + sign-out +
// oauth2/* + organization/* + admin/* + ...) through its own internal router;
// we just hand it the raw Request. The TanStack Start cookies plugin
// (configured in auth.server.ts) wires the Set-Cookie + Cookie semantics.
//
// The genericOAuth Keycloak provider is configured in-code (ADR-0044), so —
// unlike the former @better-auth/sso plugin — there is no `sso_provider` DB row
// to bootstrap before a sign-in can dispatch. The OAuth callback lands at
// /api/auth/oauth2/callback/keycloak.

import { createFileRoute } from '@tanstack/react-router'

import { auth } from '@/lib/auth/auth.server'

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => auth.handler(request),
      POST: ({ request }: { request: Request }) => auth.handler(request),
    },
  },
})
