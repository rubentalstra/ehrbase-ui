// /api/admin/audit/tasks/:name — role-gated manual trigger for the M4 audit
// tasks (ADR-0026, ADR-0027). Wraps Nitro's runTask() so the trigger goes
// through the same code path the nightly cron uses, but with explicit auth +
// CSRF + an audit event.
//
//   GET    — issue a single-use, session-bound CSRF token for the trigger.
//   POST   — Origin + CSRF + audit-reviewer role; runs the task by name and
//            returns its report.
//
// Allowed task names are restricted to the M4 set; anything else returns 404
// to keep the surface narrow (NEVER expose generic runTask() to network
// traffic). Manual triggers emit an ADMIN_CHANGE audit event so the
// sample-of-60 review later (§14.13) can see who fired what.

import { createFileRoute } from '@tanstack/react-router'
import { runTask } from 'nitro/task'
import { z } from 'zod'

import { logAudit } from '@/server/audit/runtime'
import { requireRole } from '@/server/auth'
import {
  consumeCsrfToken,
  isAllowedOrigin,
  issueCsrfToken,
} from '@/server/bff'

const ALLOWED_TASKS = ['audit:integrity', 'audit:purge'] as const
type AllowedTask = (typeof ALLOWED_TASKS)[number]
const AllowedTaskSchema = z.enum(ALLOWED_TASKS)

const PostBodySchema = z.object({ csrfToken: z.string() })

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function notFound(): Response {
  return json(404, { code: 'NOT_FOUND' })
}

function paramTask(splat: string | undefined): AllowedTask | null {
  if (!splat) return null
  const parsed = AllowedTaskSchema.safeParse(splat)
  return parsed.success ? parsed.data : null
}

export const Route = createFileRoute('/api/admin/audit/tasks/$')({
  server: {
    handlers: {
      GET: async ({ params }: { params: { _splat?: string } }) => {
        const task = paramTask(params._splat)
        if (!task) return notFound()
        const auth = await requireRole(['audit-reviewer'])
        const csrfToken = await issueCsrfToken(auth.sid)
        return json(200, { csrfToken, task })
      },
      POST: async ({
        request,
        params,
      }: {
        request: Request
        params: { _splat?: string }
      }) => {
        const task = paramTask(params._splat)
        if (!task) return notFound()

        const auth = await requireRole(['audit-reviewer'])

        if (!isAllowedOrigin(request)) {
          return json(403, { code: 'BAD_ORIGIN' })
        }
        const raw: unknown = await request.json().catch(() => ({}))
        const parsed = PostBodySchema.safeParse(raw)
        if (!parsed.success) return json(400, { code: 'INVALID_REQUEST' })
        const valid = await consumeCsrfToken(auth.sid, parsed.data.csrfToken)
        if (!valid) return json(403, { code: 'BAD_CSRF_TOKEN' })

        await logAudit({
          actor: {
            userId: auth.user.id,
            username: auth.user.email,
            displayName: auth.user.name,
            roles: auth.user.roles,
          },
          action: 'ADMIN_CHANGE',
          target: { resourceType: 'SYSTEM' },
          purpose: 'SYSTEM_ADMIN',
          outcome: 'SUCCESS',
          outcomeDetail: `manual trigger ${task}`,
          retentionPolicy: 'AUDIT_LOG',
          source: { sessionId: auth.sid },
        })

        const { result } = await runTask(task)
        return json(200, { task, result: result ?? null })
      },
    },
  },
})
