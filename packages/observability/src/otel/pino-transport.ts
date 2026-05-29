// Pino → OTel logs bridge (docs/architecture.md §13.1).
//
// Adds the `pino-opentelemetry-transport` target to the existing application
// logger so every Pino log line is also emitted as an OTel LogRecord, shipped
// to the collector, and (per the collector's `logs` pipeline) forwarded to
// Loki with the same `service.name` resource attribute as traces.
//
// The transport is OFF by default; flipped on by setting `OTEL_ENABLED=true`.
// The application logger (src/log/app.ts) calls `getOtelPinoTransport()`
// inside its `transport.targets` array; when OTel is disabled the function
// returns `null` and the array is filtered.

export type PinoTransportTarget = {
  target: string
  level?: string
  options?: Record<string, unknown>
}

/**
 * Returns a Pino transport-target entry for the OTel exporter, or `null`
 * when OTel is disabled. The Pino factory in src/log/app.ts filters nulls
 * out of the transport-target array.
 */
export function getOtelPinoTransport(): PinoTransportTarget | null {
  if (process.env.OTEL_ENABLED !== 'true') return null

  const endpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://otel-collector:4318'

  return {
    target: 'pino-opentelemetry-transport',
    options: {
      // OTLP/HTTP — same endpoint the SDK uses. The transport handles
      // `/v1/logs` itself.
      loggerName: process.env.OTEL_SERVICE_NAME ?? 'ehrbase-ui',
      serviceVersion: process.env.APP_VERSION ?? 'dev',
      messageKey: 'msg',
      resourceAttributes: {
        'service.name': process.env.OTEL_SERVICE_NAME ?? 'ehrbase-ui',
        'service.version': process.env.APP_VERSION ?? 'dev',
      },
      logRecordProcessorOptions: {
        recordProcessorType: 'batch',
        exporterOptions: {
          protocol: 'http/protobuf',
          url: `${endpoint}/v1/logs`,
        },
      },
    },
  }
}
