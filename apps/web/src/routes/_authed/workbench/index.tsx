// Workbench index (Part C Phase 1). Bare /workbench has no content of its own —
// land the user on the Templates sub-route.

import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/workbench/')({
  beforeLoad: () => {
    throw redirect({ to: '/workbench/templates' })
  },
})
