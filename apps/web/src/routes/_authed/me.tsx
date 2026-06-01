// /me — signed-in user + roles + the break-glass entry (docs/architecture.md §5;
// ADR-0045/0046). Break-glass is declared by CHOOSING a patient (name/DOB/MRN) —
// never by pasting a UUID/ehrId; the picker resolves the EHR behind the scenes.
// All copy via Paraglide.

import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'

import { m } from '@ehrbase-ui/i18n/messages'
import { FeatureErrorBoundary } from '@/components/errors/feature-error-boundary'
import { patientDisplayName, patientMrn } from '@/components/patient/patient-identity'
import { PatientPicker, type PickedPatient } from '@/components/patient/patient-picker'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export const Route = createFileRoute('/_authed/me')({
  component: Me,
  errorComponent: FeatureErrorBoundary,
})

// Mirrors MIN_JUSTIFICATION in break-glass.ts; kept local so this client
// component never imports the server module. The server re-validates.
const MIN_JUSTIFICATION = 30

const CsrfSchema = z.object({ csrfToken: z.string() })

type BreakGlassState = 'idle' | 'submitting' | 'granted' | 'error' | 'not_eligible'

function Me() {
  const { user } = Route.useRouteContext()
  const [justification, setJustification] = useState('')
  const [picked, setPicked] = useState<PickedPatient | null>(null)
  const [state, setState] = useState<BreakGlassState>('idle')

  const canSubmit =
    picked?.ehrId != null &&
    justification.trim().length >= MIN_JUSTIFICATION &&
    state !== 'submitting'

  async function requestEmergencyAccess() {
    if (!picked?.ehrId) return
    setState('submitting')
    try {
      const tokenRes = await fetch('/api/auth/break-glass', { method: 'GET' })
      const token = CsrfSchema.safeParse(await tokenRes.json())
      if (!token.success) {
        setState('error')
        return
      }
      // The picker already resolved the EHR from the chosen patient — we send
      // that ehrId (the break-glass grant is keyed per EHR). No UUID is typed.
      const res = await fetch('/api/auth/break-glass', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          csrfToken: token.data.csrfToken,
          justification,
          ehrId: picked.ehrId,
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
          <CardTitle>{m.me_signed_in_as({ name: user.name || user.email })}</CardTitle>
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
              <Label>{m.workbench_patient_selected()}</Label>
              <div className="flex flex-wrap items-center gap-3">
                <PatientPicker
                  onPick={setPicked}
                  triggerLabel={picked ? m.patient_picker_change() : m.patient_picker_choose()}
                />
                {picked ? (
                  <span className="text-sm">
                    {patientDisplayName(picked.party)}
                    {patientMrn(picked.party) ? ` · MRN ${patientMrn(picked.party)}` : ''}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-sm">{m.patient_picker_none()}</span>
                )}
              </div>
              {picked && picked.ehrId === null ? (
                <p className="text-destructive text-sm">{m.patient_picker_no_ehr()}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="bg-justification">{m.me_emergency_justification_label()}</Label>
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
              disabled={!canSubmit}
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
