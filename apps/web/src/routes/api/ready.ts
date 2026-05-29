// GET /api/ready — readiness probe (docs/architecture.md §13.4).
//
// Aggregates five subsystem probes in parallel — Valkey, EHRbase,
// Keycloak, audit DB, auth DB — with a 2-second timeout per probe.
// Returns 200 with a JSON envelope when all pass; 503 with the same
// envelope (failing probes flagged 'fail') otherwise.
//
// The actual probes live in @ehrbase-ui/observability/health and are
// dynamic-imported here so the server-only graph (Drizzle + ioredis +
// fetch wrappers) never reaches the client bundle through this route
// file. Identical pattern to apps/web/src/lib/auth/auth.functions.ts.
//
// The OTel HTTP auto-instrumentation IGNORES this path so the readiness
// poll traffic doesn't fill the trace stream.

import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/ready')({
  server: {
    handlers: {
      GET: async () => {
        const { checkReadiness } = await import('@ehrbase-ui/observability/health')
        return checkReadiness()
      },
    },
  },
})
