// GET /api/health — liveness probe (docs/architecture.md §13.4).
//
// Returns 200 if the process is alive. Used by:
//   - Docker Compose `healthcheck:` for startup ordering.
//   - (Post-v1.0) Kubernetes liveness probe.
//
// Deliberately has ZERO server-only imports — the only logic is "is the
// Node event loop responsive enough to handle a route?". No DB, no Valkey,
// no upstream call: those belong to /api/ready. Anything that calls a
// dependency here would loop the container into restart-storms when a
// downstream is temporarily unhealthy.
//
// The OTel HTTP auto-instrumentation IGNORES this path (see
// packages/observability/src/otel/sdk.ts ignoreIncomingRequestHook) so
// the liveness traffic doesn't pollute the trace stream.

import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: () =>
        new Response('ok', {
          status: 200,
          headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' },
        }),
    },
  },
})
