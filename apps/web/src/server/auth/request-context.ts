// Request-context provider for the auth package.
//
// Same shape as @/server/audit's setAuditRequestContextProvider: the
// host application registers a provider once at startup; consumers (here
// requireRole + break-glass) read the active Headers without importing
// any framework runtime. Keeps packages/auth framework-agnostic per
// ADR-0030.
//
// Usage from apps/web (TanStack Start):
//
//   import { setAuthRequestContextProvider } from '@/server/auth'
//   import { getRequest } from '@tanstack/react-start/server'
//
//   setAuthRequestContextProvider({
//     getHeaders: () => getRequest().headers,
//   })
//
// Called outside a request scope (Nitro scheduled task, test harness)
// the provider should throw — auth lookups truly need a request to bind
// the session cookie to.

export interface AuthRequestContextProvider {
  getHeaders(): Headers
}

let activeProvider: AuthRequestContextProvider | null = null

export function setAuthRequestContextProvider(
  provider: AuthRequestContextProvider,
): void {
  activeProvider = provider
}

export function _resetAuthRequestContextProviderForTests(): void {
  activeProvider = null
}

/**
 * Return the Headers of the current request, via the provider registered
 * by the host app. Throws if no provider is registered — auth flows
 * cannot run without a request scope.
 */
export function getAuthRequestHeaders(): Headers {
  if (!activeProvider) {
    throw new Error(
      '@/server/auth: no request-context provider registered. ' +
        'Call setAuthRequestContextProvider({ getHeaders }) once at app startup.',
    )
  }
  return activeProvider.getHeaders()
}
