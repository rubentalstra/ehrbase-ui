// TanStack Start instance — global request middleware (docs/architecture.md
// §5.7, §5.8).
//
// Two request middlewares run on every request:
//   1. securityHeaders — mints a per-request CSP nonce, runs the rest of the
//      pipeline inside an AsyncLocalStorage scope so the SSR router can read
//      the nonce (router.tsx → router.options.ssr.nonce), then stamps the
//      security headers onto the response.
//   2. csrf — the framework's built-in same-origin guard for server functions.
//      Providing a start instance replaces the default CSRF middleware, so we
//      re-register it here (§5.8 layer 2).
//
// This file is bundled into the CLIENT environment too (TanStack Start needs
// the startInstance reference for the route tree's client side), so its
// top-level imports MUST NOT reach any server-only package or `.server.ts`
// file — `tanstack-start-core:import-protection` denies that. The middleware
// function body itself runs only server-side (`.server(fn)` wrapper), so its
// dynamic `await import('@ehrbase-ui/http-bff')` is resolved at request time
// on the server and never lands in the client bundle.
//
// The audit + auth request-context providers are registered in
// apps/web/src/server.ts (the outermost fetch entry, which is server-only by
// construction). start.ts cannot register them itself for the import-
// protection reason above.
//
// The Paraglide locale middleware also lives in src/server.ts per the
// official Paraglide + TanStack Start integration example — it establishes
// the locale AsyncLocalStorage context before the framework pipeline runs,
// so getLocale() works in everything below (SSR, loaders, server fns).

import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

const securityHeadersMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ next, pathname }) => {
    const { applySecurityHeaders, generateNonce, runWithNonce } = await import(
      '@ehrbase-ui/http-bff'
    )
    const nonce = generateNonce()
    const result = await runWithNonce(nonce, () => next())
    applySecurityHeaders(result.response.headers, { nonce, pathname })
    return result
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeadersMiddleware, csrfMiddleware],
}))
