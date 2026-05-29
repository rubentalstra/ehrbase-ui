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
// The Paraglide locale middleware lives in src/server.ts (the outermost fetch
// handler) per the official Paraglide + TanStack Start integration example —
// it establishes the locale AsyncLocalStorage context before the framework
// pipeline runs, so getLocale() works in everything below (SSR, loaders,
// server fns).

import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'

import { applySecurityHeaders, generateNonce } from '@/lib/http/security-headers.server'
import { runWithNonce } from '@/lib/http/nonce-context.server'

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

const securityHeadersMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ next, pathname }) => {
    const nonce = generateNonce()
    const result = await runWithNonce(nonce, () => next())
    applySecurityHeaders(result.response.headers, { nonce, pathname })
    return result
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeadersMiddleware, csrfMiddleware],
}))
