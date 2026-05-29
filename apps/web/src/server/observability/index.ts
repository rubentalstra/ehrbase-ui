// @/server/observability — application logging + (M5) OTel + health.
//
// Public surface (v1.0 foundation): the Pino logger barrel. M5 adds the
// OTel SDK bootstrap + Pino-OTLP transport + redact helpers + /api/health
// + /api/ready check aggregator.

export * from './log/index.ts'
