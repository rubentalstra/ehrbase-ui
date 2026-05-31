// Reusable data table built on @tanstack/react-table — the standard table
// primitive for the whole app (architecture §8, ADR-0038). Owns sorting, an
// optional global filter, and client-side pagination; renders header/body through
// `flexRender`. For large result sets (§8: > 500 rows) pass `virtualize` to swap
// the body for a windowed, `@tanstack/react-virtual`-backed renderer that keeps
// native <table>/<tr>/<td> semantics via spacer rows (a11y-safe, no display hacks).
//
// No `as` casts anywhere (rule 3): values react-table infers are never
// pre-annotated; the aria-sort token comes from an if-ladder returning a literal
// union; optional table options are toggled with conditional object spreads.
// All copy via Paraglide (rule 4). shadcn primitives only (rule 6).

import {
  type ColumnDef,
  type Row,
  type SortDirection,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import * as React from 'react'

import { m } from '@ehrbase-ui/i18n/messages'
import { cn } from '../../lib/utils.ts'
import { DataTablePagination } from './data-table-pagination.tsx'
import { DataTableToolbar } from './data-table-toolbar.tsx'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table.tsx'

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  /** Stable row id (e.g. a primary key, or the row index for an AQL RESULT_SET). */
  getRowId?: (row: TData, index: number) => string
  /** Highlights the matching row with data-state="selected" (single-select nav). */
  selectedRowId?: string | null
  /** Show the global text-filter input above the table. */
  enableToolbar?: boolean
  /** Show the pagination footer (ignored when `virtualize` is set). */
  enablePagination?: boolean
  initialPageSize?: number
  /** Window the row body for large result sets (architecture §8). */
  virtualize?: boolean
  /** Max body height in px when virtualizing (the scroll viewport). */
  maxBodyHeight?: number
  /** Estimated row height in px for the virtualizer. */
  estimatedRowHeight?: number
}

// react-table reports the active sort as `false | 'asc' | 'desc'`; map it to the
// ARIA token with a literal-returning if-ladder (no `as` assertion — rule 3).
function ariaSort(
  sorted: false | SortDirection,
): 'ascending' | 'descending' | 'none' {
  if (sorted === 'asc') return 'ascending'
  if (sorted === 'desc') return 'descending'
  return 'none'
}

export function DataTable<TData, TValue>({
  columns,
  data,
  getRowId,
  selectedRowId,
  enableToolbar = false,
  enablePagination = true,
  initialPageSize = 25,
  virtualize = false,
  maxBodyHeight = 600,
  estimatedRowHeight = 40,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = React.useState('')

  // Virtualized tables show every row inside a scroll viewport, so pagination is
  // mutually exclusive with virtualization.
  const usePagination = enablePagination && !virtualize

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(usePagination ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    ...(getRowId ? { getRowId } : {}),
    ...(usePagination ? { initialState: { pagination: { pageSize: initialPageSize } } } : {}),
  })

  const rows = table.getRowModel().rows
  const columnCount = table.getVisibleLeafColumns().length
  const isEmpty = rows.length === 0

  function isRowSelected(row: Row<TData>): boolean {
    if (selectedRowId != null && row.id === selectedRowId) return true
    return row.getIsSelected()
  }

  const header = (
    <TableHeader>
      {table.getHeaderGroups().map((headerGroup) => (
        <TableRow key={headerGroup.id}>
          {headerGroup.headers.map((head) => (
            <TableHead
              key={head.id}
              aria-sort={
                head.column.getCanSort()
                  ? ariaSort(head.column.getIsSorted())
                  : undefined
              }
            >
              {head.isPlaceholder
                ? null
                : flexRender(head.column.columnDef.header, head.getContext())}
            </TableHead>
          ))}
        </TableRow>
      ))}
    </TableHeader>
  )

  if (virtualize && !isEmpty) {
    return (
      <div className="space-y-3">
        {enableToolbar ? (
          <DataTableToolbar value={globalFilter} onChange={setGlobalFilter} />
        ) : null}
        <DataTableVirtualShell
          rows={rows}
          columnCount={columnCount}
          header={header}
          maxBodyHeight={maxBodyHeight}
          estimatedRowHeight={estimatedRowHeight}
          isSelected={isRowSelected}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {enableToolbar ? (
        <DataTableToolbar value={globalFilter} onChange={setGlobalFilter} />
      ) : null}
      <Table>
        {header}
        <TableBody>
          {isEmpty ? (
            <TableRow>
              <TableCell
                colSpan={columnCount}
                className="text-muted-foreground h-24 text-center text-sm whitespace-normal"
              >
                {m.data_table_no_results()}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={isRowSelected(row) ? 'selected' : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {usePagination ? <DataTablePagination table={table} /> : null}
    </div>
  )
}

// Windowed body: only the rows in view (plus overscan) are mounted; top/bottom
// spacer rows reserve the scroll height. Native table semantics are preserved
// (real <tr>/<td>, no display:grid/flex, no absolute positioning), so the
// accessibility tree keeps its table roles and axe table-structure checks pass.
function DataTableVirtualShell<TData>({
  rows,
  columnCount,
  header,
  maxBodyHeight,
  estimatedRowHeight,
  isSelected,
}: {
  rows: Row<TData>[]
  columnCount: number
  header: React.ReactNode
  maxBodyHeight: number
  estimatedRowHeight: number
  isSelected: (row: Row<TData>) => boolean
}) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: 12,
  })

  const virtualItems = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()
  const firstItem = virtualItems[0]
  const lastItem = virtualItems[virtualItems.length - 1]
  const paddingTop = firstItem ? firstItem.start : 0
  const paddingBottom = lastItem ? totalSize - lastItem.end : 0

  return (
    <div
      ref={scrollRef}
      className="overflow-auto rounded-md border"
      style={{ maxHeight: maxBodyHeight }}
    >
      <Table>
        {header}
        <TableBody>
          {paddingTop > 0 ? (
            <tr aria-hidden="true">
              <td colSpan={columnCount} style={{ height: paddingTop }} />
            </tr>
          ) : null}
          {virtualItems.map((virtualItem) => {
            const row = rows[virtualItem.index]
            return (
              <TableRow
                key={row.id}
                data-index={virtualItem.index}
                data-state={isSelected(row) ? 'selected' : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className={cn('align-top')}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            )
          })}
          {paddingBottom > 0 ? (
            <tr aria-hidden="true">
              <td colSpan={columnCount} style={{ height: paddingBottom }} />
            </tr>
          ) : null}
        </TableBody>
      </Table>
    </div>
  )
}
