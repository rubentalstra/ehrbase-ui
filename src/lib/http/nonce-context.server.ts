// Per-request CSP nonce propagation (docs/architecture.md §5.7).
//
// Isolated in a .server.ts module so node:async_hooks never enters the client
// bundle (src/start.ts is the isomorphic start entry; importing this from a
// .server module makes the client build strip it). The server middleware runs
// the request pipeline inside runWithNonce(); router.tsx reads the active
// nonce through the globalThis accessor set here.

import { AsyncLocalStorage } from 'node:async_hooks'

const nonceStorage = new AsyncLocalStorage<string>()

globalThis.__ehrbaseGetNonce = () => nonceStorage.getStore()

export function runWithNonce<T>(nonce: string, fn: () => T): T {
  return nonceStorage.run(nonce, fn)
}
