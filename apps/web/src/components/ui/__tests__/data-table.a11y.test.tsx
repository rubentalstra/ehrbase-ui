// Accessibility test for the DataTable primitive — sortable headers + global
// filter + pagination must be axe-clean (WCAG 2.2 AA). Mirrors the pipeline shape
// from docs/architecture.md §12.4.

import { type ColumnDef } from '@tanstack/react-table'
import { render } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { describe, expect, it } from 'vitest'

import { DataTable } from '../data-table.tsx'
import { DataTableColumnHeader } from '../data-table-column-header.tsx'
import { axeConfig } from '@/test/axe-config'

interface Patient {
  id: string
  mrn: string
  surname: string
}

const patients: Patient[] = [
  { id: '1', mrn: 'A-100', surname: 'Janssen' },
  { id: '2', mrn: 'A-101', surname: 'de Vries' },
]

const columns: ColumnDef<Patient, unknown>[] = [
  {
    accessorKey: 'mrn',
    header: ({ column }) => <DataTableColumnHeader column={column} title="MRN" />,
    cell: ({ row }) => <span>{row.original.mrn}</span>,
  },
  {
    accessorKey: 'surname',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Surname" />,
    cell: ({ row }) => <span>{row.original.surname}</span>,
  },
]

describe('DataTable accessibility', () => {
  it('has no axe violations with sortable headers, toolbar, and pagination', async () => {
    const { container } = render(
      <DataTable
        columns={columns}
        data={patients}
        getRowId={(row) => row.id}
        enableToolbar
        initialPageSize={1}
      />,
    )
    const results = await axe(container, axeConfig)
    expect(results).toHaveNoViolations()
  })

  it('has no axe violations in the empty state', async () => {
    const { container } = render(<DataTable columns={columns} data={[]} />)
    const results = await axe(container, axeConfig)
    expect(results).toHaveNoViolations()
  })
})
