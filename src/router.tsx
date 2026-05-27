import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
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
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
