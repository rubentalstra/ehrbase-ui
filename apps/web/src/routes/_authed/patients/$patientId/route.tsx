// Patient-context layout (CLINICAL-UI.md §6; ADR-0046). Resolves the patient +
// their ehrId ONCE via getPatientContext (the ehr_id is internal — never shown
// or typed), renders the persistent PatientBanner, and provides the context to
// every child surface (overview, records, …). $patientId is the demographic id
// in the URL — reached via search/links, never typed by a user.

import { m } from '@ehrbase-ui/i18n/messages'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Outlet } from '@tanstack/react-router'

import { PatientBanner } from '@/components/patient/patient-banner'
import { PatientContextProvider } from '@/components/patient/patient-context'
import { FeatureErrorBoundary } from '@/components/errors/feature-error-boundary'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { getPatientContext } from '@/server/functions/patient.functions'

export const Route = createFileRoute('/_authed/patients/$patientId')({
  component: PatientContextLayout,
  errorComponent: FeatureErrorBoundary,
})

function PatientContextLayout() {
  const { patientId } = Route.useParams()
  const ctx = useQuery({
    queryKey: ['patient', 'context', patientId],
    queryFn: () => getPatientContext({ data: { id: patientId } }),
  })

  if (ctx.isPending) {
    return (
      <div className="space-y-2 p-4" aria-busy="true">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  if (ctx.isError) {
    return (
      <Alert variant="destructive" role="alert" className="m-4">
        <AlertDescription>{m.patient_not_found()}</AlertDescription>
      </Alert>
    )
  }

  return (
    <PatientContextProvider value={{ party: ctx.data.party, ehrId: ctx.data.ehrId }}>
      <div className="flex flex-col">
        <PatientBanner party={ctx.data.party} ehrId={ctx.data.ehrId} />
        <div className="p-4">
          <Outlet />
        </div>
      </div>
    </PatientContextProvider>
  )
}
