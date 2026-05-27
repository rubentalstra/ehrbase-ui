// Protected layout (docs/architecture.md §5.5). beforeLoad runs requireAuth
// server-side; an unauthenticated (or timed-out) visitor is redirected into
// the Keycloak login flow. The resolved user is placed on the route context
// for children.

import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { requireAuth } from '@/lib/auth/require-auth'

export const Route = createFileRoute('/_authed')({
  beforeLoad: async () => {
    try {
      const { user } = await requireAuth()
      return { user }
    } catch {
      throw redirect({ href: '/api/auth/login?redirect=/me' })
    }
  },
  component: AuthedLayout,
})

function AuthedLayout() {
  return <Outlet />
}
