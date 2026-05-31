// Browser shim for `perf_hooks` / `node:perf_hooks`, aliased in for the Storybook
// build only (see main.ts). A storied component that imports a DB-backed server
// function pulls `postgres` into the browser bundle, and postgres does
// `import { performance } from 'perf_hooks'`. Vite externalises the builtin to an
// export-less browser stub, so the named import is a hard Rollup error. The
// browser already has a global `performance`, so re-export it.
export const performance = globalThis.performance

export default { performance: globalThis.performance }
