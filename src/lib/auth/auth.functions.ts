// createServerFn helpers per the official Better Auth + TanStack Start
// integration (https://better-auth.com/docs/integrations/tanstack).
//
// `getSession` returns the session object (or null) — used by route
// `beforeLoad` to decide whether to redirect to `/login`. `ensureSession`
// throws when there is no session — used by protected server functions.
//
// We keep the .server.ts module behind a dynamic import so the Better
// Auth instance + its plugin imports never enter the client bundle
// (CLAUDE.md rule 7). The createServerFn boundary already runs only on
// the server, so this is belt-and-braces.

import { createServerFn } from '@tanstack/react-start'

export const getSession = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { getRequestHeaders } = await import('@tanstack/react-start/server')
    const { auth } = await import('@/lib/auth/auth.server')
    const headers = getRequestHeaders()
    return auth.api.getSession({ headers })
  },
)

export const ensureSession = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { getRequestHeaders } = await import('@tanstack/react-start/server')
    const { auth } = await import('@/lib/auth/auth.server')
    const headers = getRequestHeaders()
    const session = await auth.api.getSession({ headers })
    if (!session) throw new Error('Unauthorized')
    return session
  },
)
