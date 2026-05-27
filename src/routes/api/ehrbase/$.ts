// GET|POST|PUT|DELETE /api/ehrbase/* — the BFF EHRbase pass-through
// (docs/architecture.md §5, §5.9, §10, §14.3).
//
// One authenticated, rate-limited, audited choke point in front of EHRbase:
//   requireAuth → attach Bearer (refreshed near expiry) → classify the call →
//   apply the matching §5.9 limit (keyed by session) → forward to EHRBASE_URL
//   → audit the PHI-touching call → return, CONFLATING 404/403 (§10) and never
//   leaking a raw upstream error body. A correlation id ties the user-facing
//   error back to the application log.
//
// No orval-typed client yet — raw transport. Typed calls arrive with the
// features that issue them in later milestones.

import { randomUUID } from 'node:crypto'

import { createFileRoute } from '@tanstack/react-router'

import { logAudit } from '@/lib/audit/logger.server'
import { classifyRequest, extractEhrId } from '@/lib/http/ehrbase-proxy.server'
import { checkRateLimit, tooManyRequests } from '@/lib/http/rate-limit.server'
import { resolveAuth, type AuthContext } from '@/lib/auth/require-auth.server'

const EHRBASE_URL = process.env.EHRBASE_URL ?? 'http://localhost:8080/ehrbase/rest/openehr/v1'

function json(status: number, body: Record<string, unknown>, correlationId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-correlation-id': correlationId },
  })
}

async function proxy({
  request,
  params,
}: {
  request: Request
  params: { _splat?: string }
}): Promise<Response> {
  const correlationId = randomUUID()

  let auth: AuthContext
  try {
    auth = await resolveAuth()
  } catch (err) {
    if (err instanceof Response) return err
    return json(401, { code: 'UNAUTHENTICATED' }, correlationId)
  }

  const splat = params._splat ?? ''
  const search = new URL(request.url).search
  const targetUrl = `${EHRBASE_URL}/${splat}${search}`
  const cls = classifyRequest(request.method, splat)

  const limit = await checkRateLimit(cls.rateLimit, auth.sid)
  if (!limit.allowed) return tooManyRequests(limit)

  const headers = new Headers()
  const contentType = request.headers.get('content-type')
  if (contentType) headers.set('content-type', contentType)
  const accept = request.headers.get('accept')
  if (accept) headers.set('accept', accept)
  const prefer = request.headers.get('prefer')
  if (prefer) headers.set('prefer', prefer)
  headers.set('authorization', `Bearer ${auth.accessToken}`)
  headers.set('x-correlation-id', correlationId)

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  const init: RequestInit = {
    method: request.method,
    headers,
    ...(hasBody ? { body: await request.arrayBuffer() } : {}),
  }

  let upstream: Response
  try {
    upstream = await fetch(targetUrl, init)
  } catch {
    await audit('FAILURE', 'upstream_unreachable')
    return json(502, { code: 'UPSTREAM_ERROR' }, correlationId)
  }

  await audit(upstream.ok ? 'SUCCESS' : 'FAILURE', upstream.ok ? undefined : `HTTP ${upstream.status}`)

  // §10 — conflate 404 and 403 (existence of a record is itself sensitive).
  if (upstream.status === 403 || upstream.status === 404) {
    return json(404, { code: 'NOT_FOUND' }, correlationId)
  }
  if (upstream.status >= 500) {
    return json(502, { code: 'UPSTREAM_ERROR' }, correlationId)
  }
  if (!upstream.ok) {
    // Other 4xx — return the status but a generic code (the upstream body may
    // echo submitted PHI; never forward it raw).
    return json(upstream.status, { code: 'REQUEST_REJECTED' }, correlationId)
  }

  const respHeaders = new Headers()
  const upstreamCt = upstream.headers.get('content-type')
  if (upstreamCt) respHeaders.set('content-type', upstreamCt)
  const location = upstream.headers.get('location')
  if (location) respHeaders.set('location', location)
  const etag = upstream.headers.get('etag')
  if (etag) respHeaders.set('etag', etag)
  respHeaders.set('x-correlation-id', correlationId)
  respHeaders.set('cache-control', 'no-store, no-cache, must-revalidate, private')

  return new Response(upstream.body, { status: upstream.status, headers: respHeaders })

  async function audit(outcome: 'SUCCESS' | 'FAILURE', detail?: string) {
    await logAudit({
      actor: {
        userId: auth.user.id,
        username: auth.user.email,
        displayName: auth.user.name,
        roles: auth.user.roles,
      },
      action: cls.action,
      target: { ehrId: extractEhrId(splat), resourceType: cls.resourceType },
      purpose: 'TREATMENT',
      lawfulBasis: '9(2)(h)',
      outcome,
      outcomeDetail: detail,
      source: { sessionId: auth.sid, correlationId },
    })
  }
}

export const Route = createFileRoute('/api/ehrbase/$')({
  server: {
    handlers: {
      GET: proxy,
      POST: proxy,
      PUT: proxy,
      DELETE: proxy,
      PATCH: proxy,
    },
  },
})
