// /api/auth/break-glass — emergency-access endpoint (docs/architecture.md
// §5.6, §5.8).
//
//   GET  — issue a single-use, session-bound CSRF token for the modal form.
//   POST — Origin-checked + CSRF-token-gated; grants the 60-minute elevation
//          via grantEmergencyAccess (which audits + enforces the 3/lifetime
//          ceiling). The 4th attempt forces logout + re-auth.

import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import {
  BreakGlassRequestSchema,
  grantEmergencyAccess,
} from '@/lib/auth/break-glass.server'
import { resolveAuth } from '@/lib/auth/require-auth.server'
import { consumeCsrfToken, isAllowedOrigin, issueCsrfToken } from '@/lib/http/csrf.server'

const PostBodySchema = BreakGlassRequestSchema.extend({ csrfToken: z.string() })

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/auth/break-glass')({
  server: {
    handlers: {
      GET: async () => {
        const auth = await resolveAuth()
        const csrfToken = await issueCsrfToken(auth.sid)
        return json(200, { csrfToken })
      },
      POST: async ({ request }) => {
        const auth = await resolveAuth()

        if (!isAllowedOrigin(request)) {
          return json(403, { code: 'BAD_ORIGIN' })
        }

        const raw: unknown = await request.json()
        const parsed = PostBodySchema.safeParse(raw)
        if (!parsed.success) return json(400, { code: 'INVALID_REQUEST' })

        const valid = await consumeCsrfToken(auth.sid, parsed.data.csrfToken)
        if (!valid) return json(403, { code: 'BAD_CSRF_TOKEN' })

        const outcome = await grantEmergencyAccess(auth, {
          justification: parsed.data.justification,
          ehrId: parsed.data.ehrId,
          deniedRoles: parsed.data.deniedRoles,
        })

        if (outcome.status === 'forced_logout') {
          // grantEmergencyAccess() already revoked every active session via
          // the Better Auth admin API; the browser cookie will fail-closed
          // on the next request. Surface the forced-reauth signal so the UI
          // can redirect to /api/auth/sign-in/sso.
          return json(401, { code: 'FORCED_REAUTH' })
        }
        return json(200, { code: 'GRANTED', expiresInSeconds: outcome.expiresInSeconds })
      },
    },
  },
})
