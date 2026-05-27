import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'

import { routeTree } from './routeTree.gen'
import { makeQueryClient } from '@/lib/query/client'
import { deLocalizeUrl, localizeUrl } from '@/paraglide/runtime.js'

export function getRouter() {
  // Per-request on the server (one client per request → no PHI cache bleed,
  // docs/architecture.md §5.5); once per session on the client.
  const queryClient = makeQueryClient()

  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    // Per-request CSP nonce (docs/architecture.md §5.7), set server-side in
    // src/start.ts. On the client this is undefined — the nonce is already
    // baked into the SSR'd document.
    ssr: {
      nonce:
        typeof window === 'undefined' ? globalThis.__ehrbaseGetNonce?.() : undefined,
    },
    // URL-prefix i18n (docs/architecture.md §11.4). `input` de-localizes an
    // incoming URL before route matching (e.g. /nl/patients → /patients);
    // `output` re-localizes generated hrefs. English-only today (default
    // urlPatterns leave the base locale unprefixed) → this is a pass-through,
    // but the machinery is live so adding Dutch is config-only (§11.6).
    rewrite: {
      input: ({ url }) => deLocalizeUrl(url),
      output: ({ url }) => localizeUrl(url),
    },
  })

  // Auto dehydrate/hydrate the query cache across the SSR boundary and wrap the
  // app in QueryClientProvider. Mutates the router in place (returns void).
  setupRouterSsrQueryIntegration({ router, queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
