// TanStack Start instance — global request middleware (docs/architecture.md
// §5.7, §5.8, §11.4).
//
// Three request middlewares run on every request, in order:
//   1. securityHeaders — mints a per-request CSP nonce, runs the rest of the
//      pipeline inside an AsyncLocalStorage scope so the SSR router can read
//      the nonce (router.tsx → router.options.ssr.nonce), then stamps the
//      security headers onto the response.
//   2. locale — establishes the Paraglide locale AsyncLocalStorage context so
//      getLocale() resolves correctly in loaders/server-fns/SSR (§11.4). It
//      passes the ORIGINAL request to next() because TanStack Router's
//      `rewrite` already de-localizes the URL; using Paraglide's rewritten
//      request would double-rewrite and loop (see src/paraglide/server.js).
//   3. csrf — the framework's built-in same-origin guard for server functions.
//      Providing a start instance replaces the default CSRF middleware, so we
//      re-register it here (§5.8 layer 2).

import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'

import { applySecurityHeaders, generateNonce } from '@/lib/http/security-headers.server'
import { runWithNonce } from '@/lib/http/nonce-context.server'
import { paraglideMiddleware } from '@/paraglide/server.js'

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

const localeMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ next, request }) => {
    let result: Awaited<ReturnType<typeof next>> | undefined
    const response = await paraglideMiddleware(request, async () => {
      result = await next()
      return result.response
    })
    // Normal path: resolve ran, return the pipeline result unchanged. If it
    // did not, Paraglide produced a locale redirect (non-base locale) before
    // the pipeline ran — short-circuit with that Response.
    if (!result) {
      throw response
    }
    return result
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeadersMiddleware, localeMiddleware, csrfMiddleware],
}))
