// requireAuth — the createServerFn a route's beforeLoad calls to gate access
// (docs/architecture.md §5.5). Lives in a client-importable module (NOT
// `.server.ts`): the client imports only the generated RPC stub. The handler
// runs server-side and dynamically imports the server-only resolver, so no
// server module enters the client graph. It returns ONLY the user — never the
// session tokens.

import { createServerFn } from '@tanstack/react-start'

export const requireAuth = createServerFn().handler(async () => {
  const { resolveAuth } = await import('@/lib/auth/require-auth.server')
  const ctx = await resolveAuth()
  return { user: ctx.user }
})
