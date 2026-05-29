// Application log stream (docs/architecture.md §13.1).
//
// Three log streams are described in the architecture:
//   1. Audit log     — NEN 7513 events, lands in Milestone 4 with hash chain.
//   2. Application   — debug/info/warn/error from app code, SANITIZED (no PHI).
//   3. Access        — HTTP request layer (status, latency, route).
//
// This module configures only the APPLICATION stream. The audit stream
// (src/lib/audit/logger.server.ts) and access stream (pino-http middleware)
// are deferred to later milestones.
//
// Redaction policy: the application log must NEVER contain PHI, credentials,
// or session tokens. Anything that smells like a secret is filtered before
// the log line is serialized. See §13.1 + the layered-redaction discussion
// for OpenTelemetry spans (§13.2) — same principles, same blocklist.

import pino, { type LoggerOptions } from 'pino'

const isProduction = process.env.NODE_ENV === 'production'

const baseOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
  base: {
    service: 'ehrbase-ui',
    env: process.env.NODE_ENV ?? 'development',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Field-level redaction. The string paths use pino's path syntax:
  //   '*.password' means any object's password key anywhere in the log line.
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
  // Structured JSON to stdout. The container runtime (docker, k8s) captures
  // it; Promtail/Fluent Bit ships to Loki in §13.1's target deployment.
  // No prettifier in production — preserves JSON for log shippers.
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard' },
        },
      }),
}

export const appLog = pino(baseOptions)

// Convenience helper for tagging logs with a correlation ID (§10) so
// support staff can trace a user-facing error back to the request.
export function withCorrelationId(correlationId: string) {
  return appLog.child({ correlationId })
}
