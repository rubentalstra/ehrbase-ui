// TanStack Start server entry — the OUTERMOST fetch handler the framework
// dispatches to. Wraps the default handler with Paraglide's middleware so the
// locale AsyncLocalStorage context is in place for every request (SSR, server
// fns, loaders, route handlers).
//
// This file matches the official Paraglide + TanStack Start integration
// example verbatim:
//   https://github.com/opral/paraglide-js/tree/main/examples/tanstack-start
//   https://inlang.com/m/gerre34r/library-inlang-paraglideJs/tanstack-start
//
// IMPORTANT: pass the ORIGINAL `req` to handler.fetch — NOT the modified
// `request` from the paraglideMiddleware callback. TanStack Router handles URL
// localization itself via its `rewrite` option (see src/router.tsx), so using
// the paraglide-rewritten request would double-rewrite and produce a redirect
// loop. The middleware docs call this out explicitly.

import handler from '@tanstack/react-start/server-entry'

import { paraglideMiddleware } from '@ehrbase-ui/i18n/server'

export default {
  fetch(req: Request): Promise<Response> {
    return paraglideMiddleware(req, () => handler.fetch(req))
  },
}
