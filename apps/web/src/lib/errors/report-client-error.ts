// reportClientError — the single client-side error funnel (docs/architecture.md
// §10). Used by the TanStack Query caches' onError and by the error boundaries.
//
// It (1) mints a correlationId, (2) fire-and-forgets a sanitized envelope to
// /api/log/client-error so support can trace it server-side, and (3) shows the
// user a single generic toast — never the raw error text (§10 rule 1). The
// correlationId is returned so a boundary can display "give support this id".
//
// Isomorphic by design (imported from the query client, which is built on both
// server and client). The network + toast side effects only fire in the
// browser; on the server it is a no-op that still returns an id.

import { toast } from 'sonner'

import { m } from '@ehrbase-ui/i18n/messages'

const MAX_MESSAGE_LENGTH = 500

function sanitize(err: unknown): { code?: string; message: string } {
  if (err instanceof Error) {
    return {
      code: err.name,
      message: err.message.slice(0, MAX_MESSAGE_LENGTH),
    }
  }
  return { message: String(err).slice(0, MAX_MESSAGE_LENGTH) }
}

export function reportClientError(
  err: unknown,
  correlationId: string = crypto.randomUUID(),
): string {
  if (typeof window !== 'undefined') {
    const { code, message } = sanitize(err)
    void fetch('/api/log/client-error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ correlationId, code, message }),
      keepalive: true,
    }).catch(() => {
      // Best-effort telemetry — a failed report must not throw into the
      // boundary that called us.
    })
    toast.error(m.error_generic())
  }

  return correlationId
}
