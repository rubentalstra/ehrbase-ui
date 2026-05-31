// Behaviour tests for the DataTable primitive: sorting, global filter, client
// pagination, and the empty state. Mirrors the axe pipeline shape from
// docs/architecture.md §12.4 (see button.a11y.test.tsx).

import { type ColumnDef } from '@tanstack/react-table'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { DataTable } from '../data-table.tsx'
import { DataTableColumnHeader } from '../data-table-column-header.tsx'

interface Person {
  id: string
  name: string
  age: number
}

const people: Person[] = [
  { id: '1', name: 'Charlie', age: 30 },
  { id: '2', name: 'Alice', age: 25 },
  { id: '3', name: 'Bob', age: 35 },
]

const columns: ColumnDef<Person, unknown>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => <span>{row.original.name}</span>,
  },
  {
    accessorKey: 'age',
    header: 'Age',
    cell: ({ row }) => <span>{row.original.age}</span>,
  },
]

// The first column's cell text, in render order. Body cells have role "cell"
// (<td>); header cells are "columnheader" (<th>) and so are excluded.
function firstColumnTexts(): string[] {
  const cells = screen.getAllByRole('cell')
  const out: string[] = []
  for (let i = 0; i < cells.length; i += 2) {
    out.push(cells[i]?.textContent ?? '')
  }
  return out
}

describe('DataTable', () => {
  it('renders rows in source order by default', () => {
    render(<DataTable columns={columns} data={people} enablePagination={false} />)
    expect(firstColumnTexts()).toEqual(['Charlie', 'Alice', 'Bob'])
  })

  it('sorts ascending then descending when the column header is toggled', async () => {
    const user = userEvent.setup()
    render(<DataTable columns={columns} data={people} enablePagination={false} />)

    const nameHeader = screen.getByRole('button', { name: /Name/ })
    await user.click(nameHeader)
    expect(firstColumnTexts()).toEqual(['Alice', 'Bob', 'Charlie'])

    await user.click(nameHeader)
    expect(firstColumnTexts()).toEqual(['Charlie', 'Bob', 'Alice'])
  })

  it('reflects sort state via aria-sort on the column header', async () => {
    const user = userEvent.setup()
    render(<DataTable columns={columns} data={people} enablePagination={false} />)

    const nameColumn = screen.getByRole('columnheader', { name: /Name/ })
    expect(nameColumn.getAttribute('aria-sort')).toBe('none')

    await user.click(screen.getByRole('button', { name: /Name/ }))
    expect(nameColumn.getAttribute('aria-sort')).toBe('ascending')
  })

  it('narrows rows with the global filter', async () => {
    const user = userEvent.setup()
    render(<DataTable columns={columns} data={people} enableToolbar enablePagination={false} />)

    await user.type(screen.getByRole('searchbox'), 'bob')
    expect(firstColumnTexts()).toEqual(['Bob'])
  })

  it('shows the empty state when nothing matches', async () => {
    const user = userEvent.setup()
    render(<DataTable columns={columns} data={people} enableToolbar enablePagination={false} />)

    await user.type(screen.getByRole('searchbox'), 'zzz')
    expect(screen.getByText('No results.')).toBeInTheDocument()
  })

  it('paginates client-side', async () => {
    const user = userEvent.setup()
    render(<DataTable columns={columns} data={people} initialPageSize={2} />)

    expect(firstColumnTexts()).toEqual(['Charlie', 'Alice'])
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(firstColumnTexts()).toEqual(['Bob'])
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
  })

  it('renders column headers in the virtualized variant without error', () => {
    render(
      <DataTable columns={columns} data={people} virtualize getRowId={(_row, i) => String(i)} />,
    )
    expect(screen.getByRole('columnheader', { name: /Name/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Age' })).toBeInTheDocument()
  })
})
