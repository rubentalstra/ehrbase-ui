// Application log stream (docs/architecture.md §13.1).
//
// This module configures the APPLICATION log stream: debug/info/warn/error
// from app code, SANITIZED (no PHI).
//
// Redaction policy: the application log must NEVER contain PHI, credentials,
// or session tokens. Anything that smells like a secret is filtered before
// the log line is serialized. See §13.1 + §13.2 — same blocklist.
//
// Why no `pino.transport()` in production
// ---------------------------------------
// `pino.transport({targets: [...]})` spawns a worker_threads worker. The
// worker entry resolves its transport modules with __dirname-based path
// resolution. Nitro bundles the production server into a single ESM file
// where __dirname is not defined, and the entire request pipeline blows up
// with `ReferenceError: __dirname is not defined in ES module scope`. The
// canonical 12-factor pattern — JSON to stdout, scrape via the platform's
// log driver — is also what every hospital deployment will do anyway, so
// we just emit JSON to stdout in production.
//
// In dev (`pnpm dev`) node_modules is on disk, so Pino can find its worker
// entries — we keep `pino-pretty` for the colourised dev output.

import pino, { type LoggerOptions } from 'pino'

const isProduction = process.env.NODE_ENV === 'production'

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
}

// Build the logger. In production, no `transport` key at all → Pino writes
// JSON synchronously to stdout (process.stdout), no worker thread, no
// __dirname resolution. In dev, attach JSON-to-stdout + pretty-to-stderr.
// (The OTel log transport was removed in the 2026-05-30 core-refocus and is
// deferred with the rest of the observability stack — CLAUDE.md "Deferred".)
export const appLog = isProduction
  ? pino(baseOptions)
  : pino({
      ...baseOptions,
      transport: {
        targets: [
          { target: 'pino/file', options: { destination: 1 } },
          {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              destination: 2,
            },
          },
        ],
      },
    })

// Convenience helper for tagging logs with a correlation ID (§10) so
// support staff can trace a user-facing error back to the request.
export function withCorrelationId(correlationId: string) {
  return appLog.child({ correlationId })
}
