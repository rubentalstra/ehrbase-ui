// Root error component (docs/architecture.md §10). Wired on the root route so
// an error that escapes every feature boundary still renders a usable,
// chrome-light page rather than a blank document. Generic translated copy +
// correlationId only — never the raw error (§10 rules 1, 5).

import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'

import { reportClientError } from '@/lib/errors/report-client-error'
import { m } from '@ehrbase-ui/i18n/messages'
import { Button } from '@ehrbase-ui/ui/components/button'

export function RootError({ error, reset }: ErrorComponentProps) {
  const [correlationId] = useState(() => crypto.randomUUID())

  useEffect(() => {
    reportClientError(error, correlationId)
  }, [error, correlationId])

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-start justify-center gap-4 p-8">
      <h1 className="text-2xl font-bold">{m.error_title()}</h1>
      <p className="text-muted-foreground">{m.error_generic()}</p>
      <p className="font-mono text-xs text-muted-foreground">
        {m.error_reference({ id: correlationId })}
      </p>
      <div className="flex gap-3">
        <Button variant="outline" onClick={reset}>
          {m.error_retry()}
        </Button>
        <Button asChild>
          <Link to="/">{m.error_home()}</Link>
        </Button>
      </div>
    </main>
  )
}
