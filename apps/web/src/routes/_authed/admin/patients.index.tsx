// Admin › Patients — list + search (CLINICAL-UI.md §4 admin/patients; ADR-0031).
// INDEX route for /admin/patients. It is a SIBLING of the $partyId detail under
// the /admin layout (route.tsx Outlet), so opening a patient swaps the detail in
// — a list-as-parent-layout (no Outlet) would keep the list rendered (the "Open
// does nothing" bug). Create is a dedicated page (/admin/patients/new). Admin-only
// (route gate + server requireRole(['admin'])). Demo data seeds on first load.

import { type Party } from '@ehrbase-ui/demographic-core'
import { m } from '@ehrbase-ui/i18n/messages'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { type ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'

import {
  identifierSummary,
  patientDisplayName,
} from '@/components/admin/patient-display'
import { FeatureErrorBoundary } from '@/components/errors/feature-error-boundary'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable } from '@/components/ui/data-table'
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getProviderCapabilities,
  searchPatients,
  type PatientSearchResult,
} from '@/server/functions/patient.functions'

export const Route = createFileRoute('/_authed/admin/patients/')({
  component: PatientsAdmin,
  errorComponent: FeatureErrorBoundary,
})

interface SearchState {
  family: string
  given: string
  birthDate: string
}

const EMPTY_SEARCH: SearchState = { family: '', given: '', birthDate: '' }

function PatientsAdmin() {
  const [draft, setDraft] = useState<SearchState>(EMPTY_SEARCH)
  const [active, setActive] = useState<SearchState>(EMPTY_SEARCH)

  const caps = useQuery({
    queryKey: ['admin', 'demographic', 'capabilities'],
    queryFn: () => getProviderCapabilities(),
  })
  const list = useQuery({
    queryKey: ['admin', 'patients', active],
    queryFn: () =>
      searchPatients({
        data: {
          limit: 50,
          offset: 0,
          ...(active.family ? { family: active.family } : {}),
          ...(active.given ? { given: active.given } : {}),
          ...(active.birthDate ? { birthDate: active.birthDate } : {}),
        },
      }),
  })
  const readonly = caps.data?.readonly ?? false

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{m.admin_patients_title()}</h1>
          <p className="text-muted-foreground text-sm">{m.admin_patients_subtitle()}</p>
        </div>
        {readonly ? null : (
          <Button asChild>
            <Link to="/admin/patients/new">{m.admin_patients_create()}</Link>
          </Button>
        )}
      </div>

      {readonly ? (
        <Alert>
          <AlertDescription>{m.admin_patients_readonly()}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{m.admin_patients_search_heading()}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid items-end gap-3 sm:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault()
              setActive(draft)
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="search-family">{m.admin_patients_search_family()}</Label>
              <Input
                id="search-family"
                value={draft.family}
                onChange={(e) => setDraft({ ...draft, family: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="search-given">{m.admin_patients_search_given()}</Label>
              <Input
                id="search-given"
                value={draft.given}
                onChange={(e) => setDraft({ ...draft, given: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="search-dob">{m.admin_patients_search_birthdate()}</Label>
              <Input
                id="search-dob"
                type="date"
                value={draft.birthDate}
                onChange={(e) => setDraft({ ...draft, birthDate: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit">{m.admin_patients_search_submit()}</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDraft(EMPTY_SEARCH)
                  setActive(EMPTY_SEARCH)
                }}
              >
                {m.admin_patients_search_clear()}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{m.admin_patients_list_heading()}</CardTitle>
        </CardHeader>
        <CardContent>
          <PatientList query={list} />
        </CardContent>
      </Card>
    </div>
  )
}

function patientColumns(): ColumnDef<Party, unknown>[] {
  return [
    {
      id: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={m.admin_patients_col_name()} />
      ),
      accessorFn: (p) => patientDisplayName(p),
    },
    {
      accessorKey: 'birthDate',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={m.admin_patients_col_dob()} />
      ),
      cell: ({ row }) => <>{row.original.birthDate ?? m.admin_patients_value_none()}</>,
    },
    {
      id: 'identifiers',
      enableSorting: false,
      header: () => <>{m.admin_patients_col_identifiers()}</>,
      cell: ({ row }) => (
        <span className="font-mono text-xs">{identifierSummary(row.original)}</span>
      ),
    },
    {
      id: 'status',
      enableSorting: false,
      header: () => <>{m.admin_patients_col_status()}</>,
      cell: ({ row }) =>
        row.original.active ? (
          <Badge variant="secondary">{m.admin_patients_status_active()}</Badge>
        ) : (
          <Badge variant="destructive">{m.admin_patients_status_inactive()}</Badge>
        ),
    },
    {
      id: 'actions',
      enableSorting: false,
      cell: ({ row }) => (
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/patients/$partyId" params={{ partyId: row.original.id }}>
            {m.admin_patients_open()}
          </Link>
        </Button>
      ),
    },
  ]
}

function PatientList({
  query,
}: {
  query: ReturnType<typeof useQuery<PatientSearchResult>>
}) {
  const columns = useMemo(() => patientColumns(), [])

  if (query.isPending) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    )
  }
  if (query.isError) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{m.admin_patients_load_failed()}</AlertDescription>
      </Alert>
    )
  }
  if (query.data.parties.length === 0) {
    return <p className="text-muted-foreground text-sm">{m.admin_patients_empty()}</p>
  }
  return (
    <DataTable
      columns={columns}
      data={query.data.parties}
      caption={m.admin_patients_list_heading()}
      getRowId={(p) => p.id}
    />
  )
}
