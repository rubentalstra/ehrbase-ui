// Reusable per-feature error boundary (docs/architecture.md §10). Drop it onto
// a route's `errorComponent` to contain a failure to that feature's region
// instead of blanking the whole shell. It NEVER renders the raw error text
// (§10 rule 1) — only a generic translated message plus the correlationId the
// user can quote to support. Reporting goes through reportClientError, which
// also mints the id and shows the toast.

import { useEffect, useState } from 'react'
import type { ErrorComponentProps } from '@tanstack/react-router'

import { reportClientError } from '@/lib/errors/report-client-error'
import { m } from '@ehrbase-ui/i18n/messages'
import { Alert, AlertDescription, AlertTitle } from '@ehrbase-ui/ui/components/alert'
import { Button } from '@ehrbase-ui/ui/components/button'

export function FeatureErrorBoundary({ error, reset }: ErrorComponentProps) {
  // Stable id chosen at mount so it can render immediately; the side-effecting
  // report (network + toast) runs in the effect with that same id.
  const [correlationId] = useState(() => crypto.randomUUID())

  useEffect(() => {
    reportClientError(error, correlationId)
  }, [error, correlationId])

  return (
    <Alert variant="destructive" role="alert">
      <AlertTitle>{m.error_title()}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <span>{m.error_generic()}</span>
        <span className="font-mono text-xs">
          {m.error_reference({ id: correlationId })}
        </span>
        <Button variant="outline" size="sm" onClick={reset}>
          {m.error_retry()}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
