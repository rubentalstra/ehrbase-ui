// Browser shim for `node:async_hooks`, aliased in for the Storybook build only
// (see main.ts). Storybook builds the preview WITHOUT the TanStack Start Vite
// plugin that rewrites `createServerFn`, so `@tanstack/start-client-core`'s
// runtime — which does `import { AsyncLocalStorage } from 'node:async_hooks'` via
// @tanstack/start-storage-context — reaches the browser bundle. Vite externalises
// `node:` builtins to an export-less stub, so that named import is a hard Rollup
// error. This no-op shim supplies the export; stories never run server context.
export class AsyncLocalStorage<T> {
  getStore(): T | undefined {
    return undefined
  }
  run<R>(_store: T, callback: () => R): R {
    return callback()
  }
  enterWith(_store: T): void {
    /* no-op */
  }
  disable(): void {
    /* no-op */
  }
}

export default { AsyncLocalStorage }
