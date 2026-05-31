// Sortable column-header control for the DataTable primitive (architecture §8,
// ADR-0038). Renders the column title as a ghost button that cycles the sort
// state; a non-sortable column renders the title as plain text. Sort STATE is
// announced via `aria-sort` on the parent `<th>` (set by DataTable); this button
// only carries an sr-only hint for the NEXT action, so the visible title stays
// the accessible name (WCAG 2.5.3 Label in Name). All copy via Paraglide (rule 4).

import { type Column } from '@tanstack/react-table'
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react'
import { type ReactNode } from 'react'

import { m } from '@ehrbase-ui/i18n/messages'
import { cn } from '../../lib/utils.ts'
import { Button } from './button.tsx'

interface DataTableColumnHeaderProps<TData, TValue> {
  column: Column<TData, TValue>
  title: ReactNode
  className?: string
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return (
      <span className={cn('text-foreground font-medium', className)}>{title}</span>
    )
  }

  const sorted = column.getIsSorted()
  // The next click cycles none/desc → asc and asc → desc (TanStack's
  // toggleSorting(isCurrentlyAsc) contract). The hint describes that next action.
  const nextActionHint =
    sorted === 'asc' ? m.data_table_sort_descending() : m.data_table_sort_ascending()

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn('-ml-2.5', className)}
      onClick={() => column.toggleSorting(sorted === 'asc')}
    >
      <span>{title}</span>
      <span className="sr-only">{nextActionHint}</span>
      {sorted === 'asc' ? (
        <ArrowUpIcon aria-hidden="true" />
      ) : sorted === 'desc' ? (
        <ArrowDownIcon aria-hidden="true" />
      ) : (
        <ChevronsUpDownIcon aria-hidden="true" />
      )}
    </Button>
  )
}
