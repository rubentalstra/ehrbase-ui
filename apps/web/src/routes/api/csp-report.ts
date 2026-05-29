// POST /api/csp-report — CSP violation sink (docs/architecture.md §5.7).
//
// Only active in dev/staging, where the policy ships as Report-Only. Reports
// are logged to the application stream (never the audit stream) and rate
// limited per source IP (§5.9). We never enable this in production because the
// violation reports can themselves leak URLs (potential PHI).

import { createFileRoute } from '@tanstack/react-router'
import { getRequestHeader } from '@tanstack/react-start/server'

import { appLog } from '@ehrbase-ui/observability/log'
import { checkRateLimit } from '@ehrbase-ui/http-bff'

export const Route = createFileRoute('/api/csp-report')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip =
          getRequestHeader('x-forwarded-for')?.split(',')[0]?.trim() ??
          getRequestHeader('x-real-ip') ??
          'unknown'

        const limit = await checkRateLimit('csp-report', ip)
        if (!limit.allowed) return new Response(null, { status: 204 })

        try {
          const body: unknown = await request.json()
          appLog.warn({ cspReport: body }, 'csp violation reported')
        } catch {
          // Malformed report — ignore.
        }
        return new Response(null, { status: 204 })
      },
    },
  },
})
