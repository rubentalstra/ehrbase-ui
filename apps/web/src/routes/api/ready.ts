// GET /api/ready — readiness probe (docs/architecture.md §13.4).
//
// Aggregates the subsystem probes in parallel — Valkey, EHRbase, Keycloak,
// auth DB, demographic DB — with a 2-second timeout per probe. Returns 200
// with a JSON envelope when all pass; 503 with the same envelope (failing
// probes flagged 'fail') otherwise.
//
// The actual probes live in @/server/observability/health and are
// dynamic-imported here so the server-only graph (Drizzle + ioredis +
// fetch wrappers) never reaches the client bundle through this route
// file. Identical pattern to apps/web/src/lib/auth/auth.functions.ts.

import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/ready')({
  server: {
    handlers: {
      GET: async () => {
        const { checkReadiness } = await import('@/server/observability/health')
        return checkReadiness()
      },
    },
  },
})
