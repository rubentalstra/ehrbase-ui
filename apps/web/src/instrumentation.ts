// Optional OTel SDK preload entry — for deployments that want absolute-
// first-load auto-instrumentation coverage.
//
// The DEFAULT boot path in this app is `apps/web/src/server.ts`, which
// calls `startOtelSdk()` at the top of the file (before any other import).
// That covers every code path TanStack Start + Nitro load lazily — which is
// the vast majority of them in this codebase. No NODE_OPTIONS / --import
// fiddling required in the package.json scripts.
//
// If a production deployment wants the auto-instrumentation to patch `http`
// / `pg` / `ioredis` BEFORE Nitro's bootstrap acquires them (a rare edge),
// preload this file via Node's `--import` flag:
//
//   NODE_OPTIONS='--import ./src/instrumentation.ts' node .output/server/index.mjs
//
// `startOtelSdk()` is idempotent — the duplicate call from server.ts is a
// no-op once this preload has already started it.

import { startOtelSdk } from '@ehrbase-ui/observability/otel'

startOtelSdk()
