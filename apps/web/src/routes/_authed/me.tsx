// /me — proves the auth flow (docs/architecture.md §5). Shows the signed-in
// user + realm roles, a sign-out control, and the break-glass path so the
// emergency-access flow can be exercised end to end. All copy via Paraglide.

import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'

import { m } from '@ehrbase-ui/i18n/messages'
import { FeatureErrorBoundary } from '@/components/errors/feature-error-boundary'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export const Route = createFileRoute('/_authed/me')({
  component: Me,
  errorComponent: FeatureErrorBoundary,
})

// Mirrors MIN_JUSTIFICATION in break-glass.server.ts; kept local so this
// client component never imports the server module. The server re-validates.
const MIN_JUSTIFICATION = 30
// Break-glass is per-EHR (ADR-0045): the clinician declares which patient's EHR
// the emergency is for. The dedicated patient-page 403 entry (pre-filling the
// EHR id) arrives with the clinical surfaces (M8); this is the manual entry.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

const CsrfSchema = z.object({ csrfToken: z.string() })

type BreakGlassState = 'idle' | 'submitting' | 'granted' | 'error' | 'not_eligible'

function Me() {
  const { user } = Route.useRouteContext()
  const [justification, setJustification] = useState('')
  const [ehrId, setEhrId] = useState('')
  const [state, setState] = useState<BreakGlassState>('idle')

  const ehrValid = UUID_RE.test(ehrId.trim())

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
          ehrId: ehrId.trim(),
        }),
      })

      if (res.status === 401) {
        window.location.href = '/login?redirect=%2Fme'
        return
      }
      if (res.status === 403) {
        setState('not_eligible')
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
        </CardContent>
      </Card>

      {user.roles.includes('clinician') ? (
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
            <Label htmlFor="bg-ehr">{m.me_emergency_ehr_label()}</Label>
            <Input
              id="bg-ehr"
              value={ehrId}
              onChange={(e) => setEhrId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              aria-describedby="bg-ehr-help"
            />
            <p id="bg-ehr-help" className="text-muted-foreground text-sm">
              {m.me_emergency_ehr_help()}
            </p>
            {ehrId.trim().length > 0 && !ehrValid ? (
              <p className="text-destructive text-sm">{m.me_emergency_ehr_invalid()}</p>
            ) : null}
          </div>

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
              !ehrValid ||
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
          {state === 'not_eligible' ? (
            <Alert variant="destructive">
              <AlertDescription>{m.me_emergency_not_eligible()}</AlertDescription>
            </Alert>
          ) : null}
          {state === 'error' ? (
            <Alert variant="destructive">
              <AlertDescription>{m.me_emergency_error()}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
