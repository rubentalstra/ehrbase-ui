// Admin section layout (CLINICAL-UI.md §4 admin/*). Gated to the `admin` role:
// the parent `_authed` layout puts the session user (with Keycloak roles) on the
// route context; here we redirect non-admins away. This is the UX/defense-in-depth
// gate — the server functions independently enforce requireRole(['admin']).

import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { FeatureErrorBoundary } from '@/components/errors/feature-error-boundary'

export const Route = createFileRoute('/_authed/admin')({
  beforeLoad: ({ context }) => {
    if (!context.user.roles.includes('admin')) {
      throw redirect({ to: '/me' })
    }
  },
  component: AdminLayout,
  errorComponent: FeatureErrorBoundary,
})

function AdminLayout() {
  return <Outlet />
}
