// Request-context provider for the audit logger.
//
// The audit package is framework-agnostic by design: it has no idea whether
// it's running inside a TanStack Start request handler, a Nitro scheduled
// task, a Vitest unit test, or a Node CLI. Each of those provides HTTP
// headers (or doesn't) through different APIs, and the audit package must
// not import any of them.
//
// Instead, the host application registers a provider at startup. The
// provider's job is to surface the four optional request-correlation
// headers when they're available, and return `undefined` otherwise.
//
// Usage from apps/web (per ADR-0030 monorepo layout):
//
//   import { setAuditRequestContextProvider } from '@/server/audit'
//   import { getRequestHeader } from '@tanstack/react-start/server'
//
//   setAuditRequestContextProvider({
//     getHeader: (name) => getRequestHeader(name) ?? undefined,
//   })
//
// Nitro tasks (apps/web/tasks/audit/*) don't register a provider — they run
// outside a request scope, so headers are simply unavailable and the logger
// records 'unknown'/'anonymous'/a generated correlation ID instead.

export interface AuditRequestContextProvider {
  getHeader(name: string): string | undefined
}

let activeProvider: AuditRequestContextProvider | null = null

/**
 * Register the request-context provider for this process. Idempotent;
 * subsequent calls overwrite. Apps should call this once at startup.
 */
export function setAuditRequestContextProvider(
  provider: AuditRequestContextProvider,
): void {
  activeProvider = provider
}

/**
 * Clear the registered provider. Used by tests.
 */
export function _resetAuditRequestContextProviderForTests(): void {
  activeProvider = null
}

/**
 * Look up a header through the registered provider. Returns undefined if no
 * provider is registered or the provider throws (e.g. called outside a
 * request scope).
 */
export function safeRequestHeader(name: string): string | undefined {
  if (!activeProvider) return undefined
  try {
    return activeProvider.getHeader(name) ?? undefined
  } catch {
    return undefined
  }
}
