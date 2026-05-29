// TanStack Start server entry — the OUTERMOST fetch handler the framework
// dispatches to. Wraps the default handler with Paraglide's middleware so the
// locale AsyncLocalStorage context is in place for every request (SSR, server
// fns, loaders, route handlers).
//
// Also binds the framework-agnostic @/server/audit + @/server/auth
// packages to TanStack Start's request-context API, and (M5) boots the OTel
// SDK as a fallback for production where Node's `--import` preload isn't
// wired through Nitro's bundle yet. `startOtelSdk()` is idempotent — dev
// pre-loads it via NODE_OPTIONS='--import ./src/instrumentation.ts' (see
// apps/web/package.json scripts.dev) and the duplicate call here is a no-op.
//
// This file is server-only by design (it's the fetch entry, never bundled
// in the client), so it can safely statically import `.server.ts` helpers
// and the OTel SDK. start.ts cannot do this binding itself because it IS
// bundled into the client environment for the route tree's client-side
// startInstance reference (per TanStack Start's import-protection plugin).
//
// This file matches the official Paraglide + TanStack Start integration
// example verbatim:
//   https://github.com/opral/paraglide-js/tree/main/examples/tanstack-start
//   https://inlang.com/m/gerre34r/library-inlang-paraglideJs/tanstack-start
//
// IMPORTANT: pass the ORIGINAL `req` to handler.fetch — NOT the modified
// `request` from the paraglideMiddleware callback. TanStack Router handles
// URL localization itself via its `rewrite` option (see src/router.tsx), so
// using the paraglide-rewritten request would double-rewrite and produce a
// redirect loop. The middleware docs call this out explicitly.

import { startOtelSdk } from '@/server/observability/otel'

// First — before any other module gets a chance to acquire `http` / `pg` /
// `ioredis` references — start the SDK. Dev preload via `--import` should
// already have done this; production falls through to this call. The SDK
// is a no-op when OTEL_ENABLED !== 'true'.
startOtelSdk()

import handler from '@tanstack/react-start/server-entry'

import { paraglideMiddleware } from '@ehrbase-ui/i18n/server'
import { registerRuntimeProviders } from '@/lib/runtime-providers.server'

registerRuntimeProviders()

export default {
  fetch(req: Request): Promise<Response> {
    return paraglideMiddleware(req, () => handler.fetch(req))
  },
}
