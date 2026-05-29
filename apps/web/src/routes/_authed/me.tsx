// /me — proves the auth flow (docs/architecture.md §5). Shows the signed-in
// user + realm roles, a sign-out control, and the break-glass path so the
// emergency-access flow can be exercised end to end. All copy via Paraglide.

import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'

import { m } from '@ehrbase-ui/i18n/messages'
import { FeatureErrorBoundary } from '@/components/errors/feature-error-boundary'
import { Alert, AlertDescription, AlertTitle } from '@ehrbase-ui/ui/components/alert'
import { Button } from '@ehrbase-ui/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@ehrbase-ui/ui/components/card'
import { Label } from '@ehrbase-ui/ui/components/label'
import { Textarea } from '@ehrbase-ui/ui/components/textarea'

export const Route = createFileRoute('/_authed/me')({
  component: Me,
  errorComponent: FeatureErrorBoundary,
})

// Mirrors MIN_JUSTIFICATION in break-glass.server.ts; kept local so this
// client component never imports the server module. The server re-validates.
const MIN_JUSTIFICATION = 30

const CsrfSchema = z.object({ csrfToken: z.string() })

type BreakGlassState = 'idle' | 'submitting' | 'granted' | 'error'

function Me() {
  const { user } = Route.useRouteContext()
  const [justification, setJustification] = useState('')
  const [state, setState] = useState<BreakGlassState>('idle')

  async function requestEmergencyAccess() {
    setState('submitting')
    try {
      const tokenRes = await fetch('/api/auth/break-glass', { method: 'GET' })
      const tokenJson: unknown = await tokenRes.json()
      const token = CsrfSchema.safeParse(tokenJson)
      if (!token.success) {
        setState('error')
        return
      }

      const res = await fetch('/api/auth/break-glass', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          csrfToken: token.data.csrfToken,
          justification,
        }),
      })

      if (res.status === 401) {
        window.location.href = '/login?redirect=%2Fme'
        return
      }
      setState(res.ok ? 'granted' : 'error')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{m.me_title()}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {m.me_signed_in_as({ name: user.name || user.email })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium">{m.me_roles_label()}</p>
            <p className="text-muted-foreground">
              {user.roles.length > 0 ? user.roles.join(', ') : m.me_no_roles()}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/me/access-log">{m.me_view_access_log()}</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{m.me_emergency_heading()}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertTitle>{m.me_emergency_heading()}</AlertTitle>
            <AlertDescription>{m.me_emergency_warning()}</AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="bg-justification">
              {m.me_emergency_justification_label()}
            </Label>
            <Textarea
              id="bg-justification"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={3}
            />
          </div>

          <Button
            type="button"
            variant="destructive"
            disabled={
              justification.trim().length < MIN_JUSTIFICATION ||
              state === 'submitting'
            }
            onClick={requestEmergencyAccess}
          >
            {m.me_emergency_submit()}
          </Button>

          {state === 'granted' ? (
            <Alert>
              <AlertDescription>{m.me_emergency_granted()}</AlertDescription>
            </Alert>
          ) : null}
          {state === 'error' ? (
            <Alert variant="destructive">
              <AlertDescription>{m.me_emergency_error()}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
