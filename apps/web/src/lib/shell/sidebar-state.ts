// createServerFn bridge for the SSR sidebar-state read (docs/architecture.md
// §3G). Same shape as requireAuth: a client-importable stub whose handler runs
// server-side and dynamically imports the server-only cookie reader, so
// @tanstack/react-start/server never enters the client bundle.

import { createServerFn } from '@tanstack/react-start'

export const getSidebarState = createServerFn().handler(async () => {
  const { readSidebarOpen } = await import('@/lib/shell/sidebar-state.server')
  return { sidebarOpen: readSidebarOpen() }
})
