// Admin › Patient detail (CLINICAL-UI.md §4 admin/patients; ADR-0031 Demographic
// IM). View/edit one patient, manage identifiers, inspect version history, and
// see / provision the linked openEHR EHR (EHR_STATUS.subject → PartyRef, rule 12).
// Admin-only (route gate + server requireRole(['admin'])). Deactivate + merge are
// VERSIONED_PARTY operations (history preserved). Paraglide + shadcn only.
//
// NOTE: a Relationships surface is deferred — DemographicProvider has add/end but
// no list method yet; surfacing it needs a provider `listRelationships` (follow-up).

import { type Party, type UpdatePartyInput } from '@ehrbase-ui/demographic-core'
import { m } from '@ehrbase-ui/i18n/messages'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { IdentifierField } from '@/components/admin/identifier-field'
import { IDENTIFIER_NAMESPACE_KEYS, nsLabel } from '@/components/admin/identifier-namespaces'
import { PatientForm } from '@/components/admin/patient-form'
import { patientDisplayName } from '@/components/admin/patient-display'
import { PatientSearch } from '@/components/patient/patient-search'
import { FeatureErrorBoundary } from '@/components/errors/feature-error-boundary'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  addPatientIdentifier,
  deactivatePatient,
  endPatientIdentifier,
  getLinkedEhr,
  getPatient,
  getProviderCapabilities,
  listPatientVersions,
  mergePatient,
  provisionEhr,
  updatePatient,
} from '@/server/functions/patient.functions'

export const Route = createFileRoute('/_authed/admin/patients/$partyId')({
  component: PatientDetail,
  errorComponent: FeatureErrorBoundary,
})

function PatientDetail() {
  const { partyId } = Route.useParams()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)

  const patientKey = ['admin', 'patient', partyId] as const
  const patient = useQuery({
    queryKey: patientKey,
    queryFn: () => getPatient({ data: { id: partyId } }),
  })
  const caps = useQuery({
    queryKey: ['admin', 'demographic', 'capabilities'],
    queryFn: () => getProviderCapabilities(),
  })
  const readonly = caps.data?.readonly ?? false

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: patientKey })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'patients'] })
  }

  const update = useMutation({
    mutationFn: (input: UpdatePartyInput) =>
      updatePatient({ data: { id: partyId, input } }),
    onSuccess: async () => {
      toast.success(m.admin_patients_updated())
      setEditing(false)
      await invalidate()
    },
    onError: () => toast.error(m.admin_patients_update_failed()),
  })

  if (patient.isPending) {
    return (
      <div className="mx-auto max-w-4xl space-y-4" aria-busy="true">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }
  if (patient.isError) {
    return (
      <div className="mx-auto max-w-4xl">
        <Alert variant="destructive" role="alert">
          <AlertDescription>{m.admin_patients_detail_load_failed()}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const p = patient.data

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Button asChild variant="link" className="px-0">
          <Link to="/admin/patients">← {m.admin_patients_detail_back()}</Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{patientDisplayName(p)}</h1>
            {p.active ? (
              <Badge variant="secondary">{m.admin_patients_status_active()}</Badge>
            ) : (
              <Badge variant="destructive">{m.admin_patients_status_inactive()}</Badge>
            )}
          </div>
          {editing ? null : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(true)} disabled={readonly}>
                {m.admin_patients_detail_edit()}
              </Button>
              <MergeDialog
                partyId={partyId}
                disabled={readonly || !(caps.data?.supportsMerge ?? false)}
                onMerged={invalidate}
              />
              <DeactivateDialog
                partyId={partyId}
                disabled={readonly || !p.active}
                onDeactivated={invalidate}
              />
            </div>
          )}
        </div>
      </div>

      {editing ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>{m.admin_patients_edit_heading()}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              {m.admin_patients_form_cancel()}
            </Button>
          </CardHeader>
          <CardContent>
            <PatientForm
              patient={p}
              pending={update.isPending}
              onSubmit={(input) => update.mutate(input)}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <LinkedEhrCard partyId={partyId} readonly={readonly} />

          <Tabs defaultValue="demographics">
            <TabsList>
              <TabsTrigger value="demographics">{m.admin_patients_detail_demographics()}</TabsTrigger>
              <TabsTrigger value="identifiers">{m.admin_patients_detail_identifiers()}</TabsTrigger>
              <TabsTrigger value="versions">{m.admin_patients_detail_versions()}</TabsTrigger>
            </TabsList>

            <TabsContent value="demographics">
              <DemographicsCard patient={p} />
            </TabsContent>
            <TabsContent value="identifiers">
              <IdentifiersCard partyId={partyId} patient={p} readonly={readonly} onChanged={invalidate} />
            </TabsContent>
            <TabsContent value="versions">
              <VersionsCard partyId={partyId} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  )
}

function DemographicsCard({ patient }: { patient: Party }) {
  const none = m.admin_patients_value_none()
  return (
    <Card>
      <CardContent className="pt-6">
        <dl className="grid gap-4 sm:grid-cols-3">
          <Field label={m.admin_patients_col_name()} value={patientDisplayName(patient)} />
          <Field label={m.admin_patients_col_dob()} value={patient.birthDate ?? none} />
          <Field label={m.admin_patients_col_gender()} value={patient.gender ?? none} />
        </dl>
        {patient.addresses.length > 0 ? (
          <ul className="text-muted-foreground mt-4 space-y-1 text-sm">
            {patient.addresses.map((a) => {
              const parts = [...(a.lines ?? []), a.postalCode, a.city, a.country].filter(Boolean)
              return <li key={parts.join('|')}>{parts.join(', ')}</li>
            })}
          </ul>
        ) : null}
        {patient.contacts.length > 0 ? (
          <ul className="text-muted-foreground mt-2 space-y-1 text-sm">
            {patient.contacts.map((c) => (
              <li key={`${c.system}:${c.value}`}>
                {c.system}: {c.value}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  )
}

function IdentifiersCard({
  partyId,
  patient,
  readonly,
  onChanged,
}: {
  partyId: string
  patient: Party
  readonly: boolean
  onChanged: () => Promise<void>
}) {
  const [namespace, setNamespace] = useState(IDENTIFIER_NAMESPACE_KEYS[0] ?? 'mrn')
  const [value, setValue] = useState('')

  const add = useMutation({
    mutationFn: () => addPatientIdentifier({ data: { partyId, namespace, value: value.trim() } }),
    onSuccess: async () => {
      toast.success(m.admin_patients_identifier_added())
      setValue('')
      await onChanged()
    },
    onError: () => toast.error(m.admin_patients_identifier_add_failed()),
  })
  const end = useMutation({
    mutationFn: (identifierId: string) =>
      endPatientIdentifier({ data: { partyId, identifierId } }),
    onSuccess: async () => {
      toast.success(m.admin_patients_identifier_ended())
      await onChanged()
    },
    onError: () => toast.error(m.admin_patients_identifier_add_failed()),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.admin_patients_detail_identifiers()}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {patient.identifiers.length === 0 ? (
          <p className="text-muted-foreground text-sm">{m.admin_patients_identifier_none()}</p>
        ) : (
          <ul className="divide-y">
            {patient.identifiers.map((id, i) => (
              <li key={id.id ?? `${id.namespace}-${i}`} className="flex items-center justify-between py-2">
                <span className="text-sm">
                  <span className="text-muted-foreground">{nsLabel(id.namespace)}: </span>
                  <span className="font-mono">{id.value}</span>
                </span>
                {!readonly && id.id ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={end.isPending}
                    onClick={() => end.mutate(id.id ?? '')}
                  >
                    {m.admin_patients_identifier_end()}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {!readonly ? (
          <form
            className="space-y-3 border-t pt-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (value.trim()) add.mutate()
            }}
          >
            <IdentifierField
              idPrefix="add-identifier"
              namespace={namespace}
              value={value}
              onNamespaceChange={setNamespace}
              onValueChange={setValue}
            />
            <Button type="submit" size="sm" disabled={value.trim().length === 0 || add.isPending}>
              {m.admin_patients_identifier_add()}
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  )
}

function VersionsCard({ partyId }: { partyId: string }) {
  const versions = useQuery({
    queryKey: ['admin', 'patient', partyId, 'versions'],
    queryFn: () => listPatientVersions({ data: { id: partyId } }),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.admin_patients_detail_versions()}</CardTitle>
      </CardHeader>
      <CardContent>
        {versions.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : versions.isError ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{m.admin_patients_detail_load_failed()}</AlertDescription>
          </Alert>
        ) : (
          <ul className="space-y-1 text-sm">
            {versions.data.map((v) => (
              <li key={v.version} className="flex justify-between">
                <span>{m.admin_patients_detail_version_label({ version: v.version })}</span>
                <span className="text-muted-foreground">
                  {m.admin_patients_detail_committed_at({ at: v.committedAt })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function LinkedEhrCard({ partyId, readonly }: { partyId: string; readonly: boolean }) {
  const queryClient = useQueryClient()
  const ehrKey = ['admin', 'patient', partyId, 'ehr'] as const
  const ehr = useQuery({ queryKey: ehrKey, queryFn: () => getLinkedEhr({ data: { id: partyId } }) })

  const provision = useMutation({
    mutationFn: () => provisionEhr({ data: { id: partyId } }),
    onSuccess: async () => {
      toast.success(m.admin_patients_ehr_provisioned())
      await queryClient.invalidateQueries({ queryKey: ehrKey })
    },
    onError: () => toast.error(m.admin_patients_ehr_provision_failed()),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.admin_patients_detail_ehr()}</CardTitle>
      </CardHeader>
      <CardContent>
        {ehr.isPending ? (
          <Skeleton className="h-6 w-72" />
        ) : ehr.isError ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{m.admin_patients_ehr_load_failed()}</AlertDescription>
          </Alert>
        ) : ehr.data.ehrId ? (
          // The ehr_id is an internal handle (ADR-0046) — show linked status,
          // not the raw UUID.
          <Badge variant="secondary">{m.admin_patients_ehr_linked()}</Badge>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">{m.admin_patients_ehr_none()}</p>
            <Button
              size="sm"
              disabled={readonly || provision.isPending}
              onClick={() => provision.mutate()}
            >
              {m.admin_patients_ehr_provision()}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DeactivateDialog({
  partyId,
  disabled,
  onDeactivated,
}: {
  partyId: string
  disabled: boolean
  onDeactivated: () => Promise<void>
}) {
  const [justification, setJustification] = useState('')
  const deactivate = useMutation({
    mutationFn: () => deactivatePatient({ data: { id: partyId, justification: justification.trim() } }),
    onSuccess: async () => {
      toast.success(m.admin_patients_deactivated())
      await onDeactivated()
    },
    onError: () => toast.error(m.admin_patients_deactivate_failed()),
  })

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          {m.admin_patients_deactivate()}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{m.admin_patients_deactivate_heading()}</AlertDialogTitle>
          <AlertDialogDescription>{m.admin_patients_deactivate_warning()}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1">
          <Label htmlFor="deactivate-reason">{m.admin_patients_deactivate_justification()}</Label>
          <Input
            id="deactivate-reason"
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{m.admin_patients_form_cancel()}</AlertDialogCancel>
          <AlertDialogAction
            disabled={justification.trim().length === 0 || deactivate.isPending}
            onClick={(e) => {
              e.preventDefault()
              deactivate.mutate()
            }}
          >
            {m.admin_patients_deactivate_confirm()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function MergeDialog({
  partyId,
  disabled,
  onMerged,
}: {
  partyId: string
  disabled: boolean
  onMerged: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  // The source patient is CHOSEN by search (name/DOB/MRN), never a pasted id
  // (ADR-0046). `from` holds the resolved party id used by the merge call.
  const [from, setFrom] = useState<Party | null>(null)
  const merge = useMutation({
    mutationFn: () => mergePatient({ data: { into: partyId, from: from?.id ?? '' } }),
    onSuccess: async () => {
      toast.success(m.admin_patients_merged())
      setOpen(false)
      setFrom(null)
      await onMerged()
    },
    onError: () => toast.error(m.admin_patients_merge_failed()),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" disabled={disabled} onClick={() => setOpen(true)}>
        {m.admin_patients_merge()}
      </Button>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{m.admin_patients_merge_heading()}</DialogTitle>
          <DialogDescription>{m.admin_patients_merge_warning()}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>{m.admin_patients_merge_from()}</Label>
          {from ? (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">{patientDisplayName(from)}</span>
              <Button variant="outline" size="sm" onClick={() => setFrom(null)}>
                {m.patient_picker_change()}
              </Button>
            </div>
          ) : (
            <PatientSearch onSelect={(p) => setFrom(p.id === partyId ? null : p)} />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {m.admin_patients_form_cancel()}
          </Button>
          <Button disabled={from === null || merge.isPending} onClick={() => merge.mutate()}>
            {m.admin_patients_merge_confirm()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
