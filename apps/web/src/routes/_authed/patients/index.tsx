// /patients — global patient search (CLINICAL-UI.md §7.2; ADR-0046). Find a patient
// by name / DOB / MRN — the human-centric entry point to a patient's record. No
// UUID/ehrId anywhere; opening a result navigates to the patient context.

import { m } from '@ehrbase-ui/i18n/messages'
import { createFileRoute } from '@tanstack/react-router'

import { FeatureErrorBoundary } from '@/components/errors/feature-error-boundary'
import { PatientSearch } from '@/components/patient/patient-search'

export const Route = createFileRoute('/_authed/patients/')({
  component: PatientsSearchPage,
  errorComponent: FeatureErrorBoundary,
})

function PatientsSearchPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{m.patients_title()}</h1>
        <p className="text-muted-foreground text-sm">{m.patients_subtitle()}</p>
      </div>
      <PatientSearch />
    </div>
  )
}
