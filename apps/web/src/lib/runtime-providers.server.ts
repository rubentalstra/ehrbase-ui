// Server-only runtime wiring — registers the request-context providers that
// @ehrbase-ui/audit and @ehrbase-ui/auth expose. Both packages are
// framework-agnostic by design: they accept a provider at startup rather
// than importing @tanstack/react-start/server themselves. apps/web is the
// host that binds them.
//
// The file is `.server.ts` so TanStack Start's Vite plugin strips it (and
// everything it transitively imports — the whole audit/auth runtime graph)
// from the client bundle. start.ts imports `registerRuntimeProviders()`
// from here and calls it once at module load.

import { getRequest, getRequestHeader } from '@tanstack/react-start/server'

import { setAuditRequestContextProvider } from '@ehrbase-ui/audit/server'
import { setAuthRequestContextProvider } from '@ehrbase-ui/auth'

export function registerRuntimeProviders(): void {
  setAuditRequestContextProvider({
    getHeader: (name) => {
      try {
        return getRequestHeader(name) ?? undefined
      } catch {
        // Called outside a request scope (Nitro scheduled task, test
        // harness). The audit logger falls back to
        // 'unknown'/random-correlation-ID.
        return undefined
      }
    },
  })
  setAuthRequestContextProvider({
    // requireRole + the M5+ server functions feed these Headers into
    // Better Auth's getSession({ headers }) call. Throws when called
    // outside a request scope — auth flows truly require a request.
    getHeaders: () => getRequest().headers,
  })
}
