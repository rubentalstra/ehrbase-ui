// Server-only runtime wiring — registers the request-context provider that
// @/server/auth exposes. The auth package is framework-agnostic by design: it
// accepts a provider at startup rather than importing
// @tanstack/react-start/server itself. apps/web is the host that binds it.
//
// The file is `.server.ts` so TanStack Start's Vite plugin strips it (and
// everything it transitively imports — the whole auth runtime graph) from the
// client bundle. start.ts imports `registerRuntimeProviders()` from here and
// calls it once at module load.

import { getRequest } from '@tanstack/react-start/server'

import { setAuthRequestContextProvider } from '@/server/auth'

export function registerRuntimeProviders(): void {
  setAuthRequestContextProvider({
    // requireRole + the M5+ server functions feed these Headers into
    // Better Auth's getSession({ headers }) call. Throws when called
    // outside a request scope — auth flows truly require a request.
    getHeaders: () => getRequest().headers,
  })
}
