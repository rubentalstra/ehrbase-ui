// @/server/observability — application logging + health.
//
// Public surface: the Pino logger barrel. Health-check probes live in
// ./health and are imported directly by the /api/ready route.

export * from './log/index.ts'
