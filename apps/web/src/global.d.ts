// Server-only accessor for the per-request CSP nonce, set in src/start.ts and
// read by src/router.tsx during SSR. Declared as an ambient global so the
// isomorphic router module can read it without importing node:async_hooks
// (which must never enter the client bundle).

declare global {
  var __ehrbaseGetNonce: (() => string | undefined) | undefined
}

export {}
