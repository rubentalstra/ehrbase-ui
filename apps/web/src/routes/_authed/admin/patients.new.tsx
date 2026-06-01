// Admin › Create patient (CLINICAL-UI.md §4 admin/patients; ADR-0031). A DEDICATED
// full-width page rather than a side sheet/modal — the form has name / identifier /
// address / contact sections and needs room (a narrow sheet cramps it). On success
// the linked EHR is auto-provisioned (EHR_STATUS.subject → PartyRef, rule 12) and we
// navigate to the new patient. Admin-only (route gate + server requireRole(['admin'])).
// The static `new` segment outranks the dynamic `$partyId` route, so this owns
// /admin/patients/new.

import { type CreatePartyInput } from '@ehrbase-ui/demographic-core'
import { m } from '@ehrbase-ui/i18n/messages'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'

import { PatientForm } from '@/components/admin/patient-form'
import { FeatureErrorBoundary } from '@/components/errors/feature-error-boundary'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { createPatient } from '@/server/functions/patient.functions'

export const Route = createFileRoute('/_authed/admin/patients/new')({
  component: CreatePatientPage,
  errorComponent: FeatureErrorBoundary,
})

function CreatePatientPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const create = useMutation({
    mutationFn: (input: CreatePartyInput) => createPatient({ data: input }),
    onSuccess: async (result) => {
      toast[result.ehrLinked ? 'success' : 'warning'](
        result.ehrLinked ? m.admin_patients_created() : m.admin_patients_created_no_ehr(),
      )
      await queryClient.invalidateQueries({ queryKey: ['admin', 'patients'] })
      await navigate({
        to: '/admin/patients/$partyId',
        params: { partyId: result.partyRef.id },
      })
    },
    onError: () => toast.error(m.admin_patients_create_failed()),
  })

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <Button asChild variant="link" className="px-0">
          <Link to="/admin/patients">← {m.admin_patients_detail_back()}</Link>
        </Button>
        <h1 className="text-2xl font-bold">{m.admin_patients_create_heading()}</h1>
        <p className="text-muted-foreground text-sm">{m.admin_patients_subtitle()}</p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <PatientForm pending={create.isPending} onSubmit={(input) => create.mutate(input)} />
        </CardContent>
      </Card>
    </div>
  )
}
