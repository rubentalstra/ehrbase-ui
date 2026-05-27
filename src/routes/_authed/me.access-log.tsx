// /me/access-log — patient-facing Article 15 access log (docs/architecture.md
// §14.8). M3 ships the scaffold + empty state only; the real data feed (who
// accessed which record, when) arrives with the M4 audit-governance milestone.
// A FLAT route file (me.access-log.tsx) so /me stays a leaf and is not
// converted into a directory.

import { createFileRoute } from '@tanstack/react-router'

import { m } from '@/paraglide/messages.js'
import { FeatureErrorBoundary } from '@/components/errors/feature-error-boundary'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export const Route = createFileRoute('/_authed/me/access-log')({
  component: AccessLog,
  errorComponent: FeatureErrorBoundary,
})

function AccessLog() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{m.access_log_title()}</h1>
        <p className="mt-1 text-muted-foreground">{m.access_log_intro()}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{m.access_log_empty_title()}</CardTitle>
          <CardDescription>{m.access_log_empty_body()}</CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  )
}
