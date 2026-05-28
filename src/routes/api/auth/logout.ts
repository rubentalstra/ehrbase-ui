// GET /api/auth/logout — sign-out bridge for plain `<a>` links
// (docs/architecture.md §5; ADR-0028).
//
// Better Auth's native sign-out endpoint is POST /api/auth/sign-out, which
// the navbar dropdown can't reach with a simple anchor. This shim calls
// auth.api.signOut server-side (clearing the Better Auth session cookies
// via tanstackStartCookies) and 302s back to the public home page. The
// LOGOUT audit event is emitted from the auth `hooks.after` middleware.

import { createFileRoute, redirect } from '@tanstack/react-router'

import { auth } from '@/lib/auth/auth.server'

export const Route = createFileRoute('/api/auth/logout')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        try {
          await auth.api.signOut({
            headers: new Headers(request.headers),
          })
        } catch {
          // Already signed out / no session — fall through to the home page.
        }
        throw redirect({ href: '/' })
      },
    },
  },
})
