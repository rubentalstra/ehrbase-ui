// OTel SDK bootstrap (docs/architecture.md §13.2).
//
// Loaded at process start via Node's `--import` flag — see apps/web/src/
// instrumentation.ts. The function `startOtelSdk()` is idempotent (a no-op
// after the first call) and is a no-op entirely when `OTEL_ENABLED !== 'true'`
// so unit tests and the build step don't try to open an OTLP socket.
//
// Architectural notes:
//   - `service.name` + `service.version` are emitted as resource attributes
//     so the collector + Tempo + Loki can pivot every signal by service
//     identity (the §13.3 metrics pipeline + the §13.1 logs pipeline both
//     pivot on these too via pino-opentelemetry-transport).
//   - Head-sampling at 10% via TraceIdRatioBasedSampler — the OTEL_SAMPLE_RATIO
//     env var is the operational knob. Tail-sampling (100% for errors,
//     slow, /me/access-log, admin) lives in the collector config; the SDK
//     just emits 10% of traces and lets the collector promote the
//     PHI-sensitive subset back to 100%.
//   - PHI redaction (§13.2) is implemented in three of the four spec layers:
//       1. SDK requestHook (here) — strips query strings, UUIDs → :id
//       3. Collector `attributes` processor (apps/web/docker/otel/...)
//       4. Collector `transform` processor (apps/web/docker/otel/...)
//     Layer 2 (a custom in-process span-attribute filter) was considered
//     but cannot mutate finished spans in OTel SDK 2.x without escape-hatch
//     casts (forbidden by CLAUDE.md Inviolable rule 3). Layers 1 + 3 + 4
//     already cover the threat model — query strings + UUID paths are
//     erased before the span leaves the host; named PHI attributes are
//     dropped at the collector for spans from this app AND for spans from
//     EHRbase / Keycloak that share our collector. If a future SDK release
//     exposes a typed mutation API, layer 2 can be added as defense in depth.

import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { resourceFromAttributes } from '@opentelemetry/resources'
import {
  PeriodicExportingMetricReader,
  type MetricReader,
} from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-node'
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions'

import { redactHttpRequestPath } from './redact.ts'

let started = false

// Map a string-valued OTEL_LOG_LEVEL env var to the enum without an `as`
// cast (CLAUDE.md Inviolable rule 3 forbids them).
function parseDiagLogLevel(raw: string): DiagLogLevel {
  switch (raw.toUpperCase()) {
    case 'NONE':
      return DiagLogLevel.NONE
    case 'ERROR':
      return DiagLogLevel.ERROR
    case 'WARN':
      return DiagLogLevel.WARN
    case 'INFO':
      return DiagLogLevel.INFO
    case 'DEBUG':
      return DiagLogLevel.DEBUG
    case 'VERBOSE':
      return DiagLogLevel.VERBOSE
    case 'ALL':
      return DiagLogLevel.ALL
    default:
      return DiagLogLevel.WARN
  }
}

/**
 * Start the OpenTelemetry SDK. Idempotent — subsequent calls return without
 * effect. No-op when `OTEL_ENABLED !== 'true'`.
 *
 * Must be called BEFORE any other application module imports so the SDK's
 * `getNodeAutoInstrumentations()` can wrap `http`, `fetch`, `pg`, and
 * `ioredis` at load time. The recommended invocation is from
 * apps/web/src/server.ts as the first statement, with an optional Node 24
 * `--import` preload (apps/web/src/instrumentation.ts) for deployments
 * that need absolute-first-load coverage.
 */
export function startOtelSdk(): void {
  if (started) return
  if (process.env.OTEL_ENABLED !== 'true') return
  started = true

  // Surface SDK self-errors on stderr at WARN level (info is noisy; ERROR
  // would mask config-load failures). Hospital deployments flip
  // OTEL_LOG_LEVEL=DEBUG when investigating a missing-trace incident.
  diag.setLogger(
    new DiagConsoleLogger(),
    parseDiagLogLevel(process.env.OTEL_LOG_LEVEL ?? 'WARN'),
  )

  const endpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://otel-collector:4318'
  const sampleRatio = Number.parseFloat(process.env.OTEL_SAMPLE_RATIO ?? '0.1')

  const metricReader: MetricReader = new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
    exportIntervalMillis: 60_000,
  })

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'ehrbase-ui',
      [ATTR_SERVICE_VERSION]: process.env.APP_VERSION ?? 'dev',
    }),
    sampler: new TraceIdRatioBasedSampler(sampleRatio),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    metricReader,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-http': {
          // PHI redaction layer 1 — strip query strings + replace UUIDs in
          // the span name's request path with `:id`. See redact.ts.
          requestHook: (span, request) => {
            const url =
              'url' in request && typeof request.url === 'string'
                ? request.url
                : ''
            const method =
              'method' in request && typeof request.method === 'string'
                ? request.method
                : 'GET'
            span.updateName(`HTTP ${method} ${redactHttpRequestPath(url)}`)
          },
          // /api/health + /api/ready are the orchestrator probes — they
          // would flood traces.
          ignoreIncomingRequestHook: (req) =>
            req.url === '/api/health' || req.url === '/api/ready',
        },
      }),
    ],
  })

  sdk.start()
  process.on('SIGTERM', () => {
    void sdk.shutdown()
  })
}
