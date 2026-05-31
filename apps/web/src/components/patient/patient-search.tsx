// Patient search — CLINICAL-UI.md §6 (patient search); ADR-0046. Find a patient
// by name / DOB / MRN — NEVER by a UUID/ehrId. Reused by the /patients page
// (navigate) and the break-glass / merge pickers (onSelect). Results show the
// safe identity set: Family, Given · DOB (age) · MRN · sex. rule 4 (Paraglide),
// rule 6a (DataTable). An empty query browses recently-added patients.

import { type Party } from '@ehrbase-ui/demographic-core'
import { m } from '@ehrbase-ui/i18n/messages'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { searchPatients } from '@/server/functions/patient.functions'

import { patientAge, patientDisplayName, patientMrn, patientSex } from './patient-identity'

interface SearchState {
  family: string
  given: string
  birthDate: string
  mrn: string
}
const EMPTY: SearchState = { family: '', given: '', birthDate: '', mrn: '' }

function dobCell(p: Party): string {
  if (!p.birthDate) return m.admin_patients_value_none()
  const age = patientAge(p.birthDate)
  return age !== null ? `${p.birthDate} (${m.patient_banner_age({ age })})` : p.birthDate
}

function columns(onSelect?: (p: Party) => void): ColumnDef<Party, unknown>[] {
  return [
    {
      id: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={m.admin_patients_col_name()} />
      ),
      accessorFn: (p) => patientDisplayName(p),
    },
    {
      id: 'dob',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={m.admin_patients_col_dob()} />
      ),
      cell: ({ row }) => <>{dobCell(row.original)}</>,
    },
    {
      id: 'mrn',
      enableSorting: false,
      header: () => <>{m.patients_col_mrn()}</>,
      cell: ({ row }) => (
        <span className="font-mono text-xs">
          {patientMrn(row.original) ?? m.admin_patients_value_none()}
        </span>
      ),
    },
    {
      id: 'sex',
      enableSorting: false,
      header: () => <>{m.patients_col_sex()}</>,
      cell: ({ row }) => <>{patientSex(row.original) ?? m.admin_patients_value_none()}</>,
    },
    {
      id: 'actions',
      enableSorting: false,
      cell: ({ row }) =>
        onSelect ? (
          <Button variant="outline" size="sm" onClick={() => onSelect(row.original)}>
            {m.patients_open()}
          </Button>
        ) : (
          <Button asChild variant="outline" size="sm">
            <Link to="/patients/$patientId" params={{ patientId: row.original.id }}>
              {m.patients_open()}
            </Link>
          </Button>
        ),
    },
  ]
}

export function PatientSearch({ onSelect }: { onSelect?: (p: Party) => void }) {
  const [draft, setDraft] = useState<SearchState>(EMPTY)
  const [active, setActive] = useState<SearchState>(EMPTY)
  const cols = useMemo(() => columns(onSelect), [onSelect])

  const query = useQuery({
    queryKey: ['patients', 'search', active],
    queryFn: () =>
      searchPatients({
        data: {
          limit: 25,
          offset: 0,
          ...(active.family ? { family: active.family } : {}),
          ...(active.given ? { given: active.given } : {}),
          ...(active.birthDate ? { birthDate: active.birthDate } : {}),
          ...(active.mrn ? { identifier: { namespace: 'mrn', value: active.mrn } } : {}),
        },
      }),
  })

  return (
    <div className="space-y-4">
      <form
        className="grid items-end gap-3 sm:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault()
          setActive(draft)
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="ps-family">{m.admin_patients_search_family()}</Label>
          <Input
            id="ps-family"
            value={draft.family}
            onChange={(e) => setDraft({ ...draft, family: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ps-given">{m.admin_patients_search_given()}</Label>
          <Input
            id="ps-given"
            value={draft.given}
            onChange={(e) => setDraft({ ...draft, given: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ps-dob">{m.admin_patients_search_birthdate()}</Label>
          <Input
            id="ps-dob"
            inputMode="numeric"
            placeholder="YYYY-MM-DD"
            value={draft.birthDate}
            onChange={(e) => setDraft({ ...draft, birthDate: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ps-mrn">{m.patients_search_mrn()}</Label>
          <Input
            id="ps-mrn"
            value={draft.mrn}
            onChange={(e) => setDraft({ ...draft, mrn: e.target.value })}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit">{m.admin_patients_search_submit()}</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDraft(EMPTY)
              setActive(EMPTY)
            }}
          >
            {m.admin_patients_search_clear()}
          </Button>
        </div>
      </form>

      {query.isPending ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : query.isError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{m.patients_load_failed()}</AlertDescription>
        </Alert>
      ) : query.data.parties.length === 0 ? (
        <p className="text-muted-foreground text-sm">{m.patients_empty()}</p>
      ) : (
        <DataTable
          columns={cols}
          data={query.data.parties}
          caption={m.patients_results_heading()}
          getRowId={(p) => p.id}
        />
      )}
    </div>
  )
}
