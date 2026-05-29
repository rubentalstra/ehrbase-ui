// POST /api/log/client-error — client-error telemetry sink (docs/architecture.md
// §10). The browser reports a sanitized error envelope here so support staff
// can correlate a user-facing failure (which only ever shows a correlationId)
// back to a server-side log line.
//
// PHI-safety (§10 rules 1, 2): the body is strictly bounded by Zod and only a
// correlationId + a short code + a length-capped message are accepted. The
// message is logged on the APPLICATION stream (never the audit stream) and the
// app-logger's redaction filter strips anything that smells like a token. We
// still cap the length so a caller cannot smuggle a large PHI blob. Rate
// limited per source IP (§5.9), mirroring csp-report.ts. Always 204.

import { createFileRoute } from '@tanstack/react-router'
import { getRequestHeader } from '@tanstack/react-start/server'
import { z } from 'zod'

import { withCorrelationId } from '@/server/observability/log'
import { checkRateLimit } from '@/server/bff'

// Exported for unit testing — the bounds here are the no-PHI / anti-flood
// guard: a caller cannot smuggle a large blob or unbounded code through this
// telemetry sink (docs/architecture.md §10).
export const BodySchema = z.object({
  correlationId: z.string().uuid().optional(),
  code: z.string().max(64).optional(),
  message: z.string().max(500),
})

export const Route = createFileRoute('/api/log/client-error')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip =
          getRequestHeader('x-forwarded-for')?.split(',')[0]?.trim() ??
          getRequestHeader('x-real-ip') ??
          'unknown'

        const limit = await checkRateLimit('client-error', ip)
        if (!limit.allowed) return new Response(null, { status: 204 })

        try {
          const json: unknown = await request.json()
          const parsed = BodySchema.safeParse(json)
          if (parsed.success) {
            const { correlationId, code, message } = parsed.data
            withCorrelationId(correlationId ?? 'client').warn(
              { code, clientMessage: message },
              'client error reported',
            )
          }
        } catch {
          // Malformed report — ignore.
        }
        return new Response(null, { status: 204 })
      },
    },
  },
})
