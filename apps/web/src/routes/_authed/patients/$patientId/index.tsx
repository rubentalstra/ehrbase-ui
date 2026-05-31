// /patients/$patientId — patient overview (CLINICAL-UI.md §7.1; ADR-0046). Reads
// the resolved patient from the context (no ehrId handling here). EHR-linked
// status is shown as a plain indicator — the raw ehr_id is never rendered.
// Admins get a link to manage demographics; clinical record surfaces land here
// in later milestones.

import { m } from '@ehrbase-ui/i18n/messages'
import { createFileRoute, Link } from '@tanstack/react-router'

import { usePatientContext } from '@/components/patient/patient-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/_authed/patients/$patientId/')({
  component: PatientOverview,
})

function PatientOverview() {
  const { party, ehrId } = usePatientContext()
  const { user } = Route.useRouteContext()
  const isAdmin = user.roles.includes('admin')

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{m.patient_overview_heading()}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            {ehrId ? (
              <Badge variant="secondary">{m.patient_overview_ehr_linked()}</Badge>
            ) : (
              <span className="text-muted-foreground text-sm">
                {m.patient_overview_ehr_none()}
              </span>
            )}
          </div>
          {isAdmin ? (
            <Button asChild variant="outline">
              <Link to="/admin/patients/$partyId" params={{ partyId: party.id }}>
                {m.patient_overview_manage()}
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
