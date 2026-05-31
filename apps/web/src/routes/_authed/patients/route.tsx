// Clinical patients section layout (CLINICAL-UI.md §6; ADR-0046). Gated to the
// clinical/admin roles (the `_authed` layout puts the session user + Keycloak
// roles on the route context). UX/defense-in-depth gate — the patient server
// functions independently enforce requireRole(['clinician','admin']).

import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { FeatureErrorBoundary } from '@/components/errors/feature-error-boundary'

export const Route = createFileRoute('/_authed/patients')({
  beforeLoad: ({ context }) => {
    const roles = context.user.roles
    if (!roles.includes('clinician') && !roles.includes('admin')) {
      throw redirect({ to: '/me' })
    }
  },
  component: () => <Outlet />,
  errorComponent: FeatureErrorBoundary,
})
