// Application log stream (docs/architecture.md §13.1).
//
// Three log streams are described in the architecture:
//   1. Audit log     — NEN 7513 events; landed in Milestone 4 with hash chain.
//   2. Application   — debug/info/warn/error from app code, SANITIZED (no PHI).
//   3. Access        — HTTP request layer (status, latency, route).
//
// This module configures only the APPLICATION stream. The audit stream
// lives in @ehrbase-ui/audit. Per-request access logging comes from the
// http auto-instrumentation in @ehrbase-ui/observability/otel.
//
// Redaction policy: the application log must NEVER contain PHI, credentials,
// or session tokens. Anything that smells like a secret is filtered before
// the log line is serialized. See §13.1 + §13.2 — same blocklist.
//
// OTel-pino bridge (M5): when OTEL_ENABLED=true, every Pino log line is
// ALSO emitted as an OTel LogRecord and forwarded to the collector — which
// fans it out to Loki via the `logs` pipeline (apps/web/docker/otel/
// collector-config.yaml). The bridge target is constructed lazily so unit
// tests + the build step don't need an OTLP endpoint reachable.

import pino, { type LoggerOptions } from 'pino'

import { getOtelPinoTransport } from '../otel/pino-transport.ts'

const isProduction = process.env.NODE_ENV === 'production'

// Always emit a structured JSON line to stdout (the container runtime
// captures it; Promtail/Fluent Bit ships to Loki in §13.1's target
// deployment). In dev we additionally pretty-print to stdout via the
// pino-pretty target. When OTEL_ENABLED=true we add the OTLP target so
// the collector receives the same lines on `/v1/logs`.
const stdoutTarget = {
  target: 'pino/file',
  options: { destination: 1 }, // stdout — always JSON, no prettifier
}

const prettyTarget = isProduction
  ? null
  : {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard', destination: 2 },
    }

const transportTargets = [stdoutTarget, prettyTarget, getOtelPinoTransport()].filter(
  (t): t is NonNullable<typeof t> => t !== null,
)

const baseOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
  base: {
    service: 'ehrbase-ui',
    env: process.env.NODE_ENV ?? 'development',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      // Credentials / tokens — never log these.
      '*.password',
      '*.passwd',
      'password',
      'passwd',
      'token',
      '*.token',
      'access_token',
      '*.access_token',
      'refresh_token',
      '*.refresh_token',
      'id_token',
      '*.id_token',
      'authorization',
      '*.authorization',
      'cookie',
      '*.cookie',
      'set-cookie',
      '*.set-cookie',

      // Patient identifiers — even pseudonymized, these don't belong in app
      // logs (the audit log is the dedicated path for these).
      '*.ehrId',
      '*.ehrid',
      '*.bsn',
      'bsn',
      'nhi',
      '*.nhi',
      '*.email',
      'email',

      // Common request-header / fetch-init shapes.
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
    ],
    censor: '[REDACTED]',
    remove: false,
  },
  transport: { targets: transportTargets },
}

export const appLog = pino(baseOptions)

// Convenience helper for tagging logs with a correlation ID (§10) so
// support staff can trace a user-facing error back to the request.
export function withCorrelationId(correlationId: string) {
  return appLog.child({ correlationId })
}
