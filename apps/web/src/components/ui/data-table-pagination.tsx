// Pagination footer for the DataTable primitive (architecture §8, ADR-0038).
// A rows-per-page Select + a "Page X of Y" status + prev/next buttons, all wired
// to the TanStack Table instance. The Select's string value is converted with
// Number() — never an `as` cast (rule 3). All copy via Paraglide (rule 4).

import { type Table } from '@tanstack/react-table'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useId } from 'react'

import { m } from '@ehrbase-ui/i18n/messages'
import { Button } from './button.tsx'
import { Label } from './label.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select.tsx'

interface DataTablePaginationProps<TData> {
  table: Table<TData>
  pageSizeOptions?: number[]
}

export function DataTablePagination<TData>({
  table,
  pageSizeOptions = [10, 25, 50, 100],
}: DataTablePaginationProps<TData>) {
  const selectId = useId()
  const { pageIndex, pageSize } = table.getState().pagination
  const pageCount = Math.max(table.getPageCount(), 1)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Label
          htmlFor={selectId}
          className="text-muted-foreground text-sm font-normal"
        >
          {m.data_table_rows_per_page()}
        </Label>
        <Select
          value={String(pageSize)}
          onValueChange={(value) => table.setPageSize(Number(value))}
        >
          <SelectTrigger id={selectId} size="sm" className="w-[4.5rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground text-sm" aria-live="polite">
          {m.data_table_page_of({ page: pageIndex + 1, total: pageCount })}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={m.data_table_previous_page()}
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            <ChevronLeftIcon aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={m.data_table_next_page()}
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            <ChevronRightIcon aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  )
}
