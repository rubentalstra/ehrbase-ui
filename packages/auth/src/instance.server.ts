// Service locator for the active Better Auth instance.
//
// packages/auth is intentionally framework-agnostic: the host application
// constructs the Better Auth instance with whatever cookie-handling plugin
// its HTTP runtime requires (tanstackStartCookies for TanStack Start,
// nextCookies for Next.js, custom adapter for a plain Node server) and
// then registers the result with setAuthInstance(...) once at startup.
//
// break-glass.server.ts, require-role.server.ts, and any other internal
// consumer reads through getAuthInstance() — they do NOT import the
// instance directly. This keeps the package's import graph free of
// TanStack Start (or any other framework) coupling.
//
// Usage from apps/web (per ADR-0030):
//
//   import { buildAuth, setAuthInstance } from '@ehrbase-ui/auth'
//   import { tanstackStartCookies } from 'better-auth/tanstack-start'
//
//   export const auth = buildAuth({
//     extraPlugins: [tanstackStartCookies()],
//   })
//   setAuthInstance(auth)

import type { buildAuth } from './factory.server.ts'

/**
 * The shape of the instance produced by buildAuth(). Captured as the return
 * type so consumers don't have to import better-auth themselves to type-narrow.
 */
export type AuthInstance = ReturnType<typeof buildAuth>

let activeAuth: AuthInstance | null = null

/**
 * Register the active Better Auth instance for this process. Idempotent;
 * subsequent calls overwrite. Apps should call this once at startup,
 * immediately after constructing the instance via buildAuth().
 */
export function setAuthInstance(auth: AuthInstance): void {
  activeAuth = auth
}

/**
 * Retrieve the active Better Auth instance. Throws a clear error when no
 * instance has been registered (rather than returning null) because every
 * consumer of this getter has a hard runtime dependency on the instance.
 */
export function getAuthInstance(): AuthInstance {
  if (!activeAuth) {
    throw new Error(
      '@ehrbase-ui/auth: no Better Auth instance registered. ' +
        'Call setAuthInstance(buildAuth({...})) once at app startup.',
    )
  }
  return activeAuth
}

/**
 * Test helper — drop the registered instance so individual tests can set
 * their own stub. Not exported from the public barrel.
 */
export function _resetAuthInstanceForTests(): void {
  activeAuth = null
}
