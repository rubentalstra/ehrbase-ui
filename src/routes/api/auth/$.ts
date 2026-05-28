// /api/auth/$ — Better Auth catch-all (docs/architecture.md §5; ADR-0028).
//
// Replaces the M2 per-endpoint routes (login.ts / callback.ts / logout.ts).
// Better Auth dispatches every supported path (sign-in/* + sign-out + sso/*
// + organization/* + admin/* + ...) through its own internal router; we
// just hand it the raw Request. The TanStack Start cookies plugin
// (configured in auth.server.ts) wires the Set-Cookie + Cookie semantics.
//
// First-hit bootstrap: ensureKeycloakSsoProviderRegistered() makes sure the
// `sso_provider` row for our Keycloak realm is in place before any SSO
// flow can dispatch. The promise is memoised inside auth.server.ts so the
// DB write only happens once per process.

import { createFileRoute } from '@tanstack/react-router'

import {
  auth,
  ensureKeycloakSsoProviderRegistered,
} from '@/lib/auth/auth.server'

async function dispatch(request: Request): Promise<Response> {
  await ensureKeycloakSsoProviderRegistered()
  return auth.handler(request)
}

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => dispatch(request),
      POST: ({ request }: { request: Request }) => dispatch(request),
    },
  },
})
