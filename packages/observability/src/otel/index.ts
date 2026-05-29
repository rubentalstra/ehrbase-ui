// @ehrbase-ui/observability/otel — OTel SDK bootstrap entry.
//
// Consumers preload this via Node's `--import` flag at process start
// (apps/web/src/instrumentation.ts). The SDK starts auto-instrumentations
// (http, fetch, pg, ioredis) + a head-sampling tracer + a metric reader
// before any other module loads.

export { startOtelSdk } from './sdk.ts'
export { getMeter, type EhrbaseUiMeter } from './metrics.ts'
