// Global-filter toolbar for the DataTable primitive (architecture §8, ADR-0038).
// A single search input bound to the table's global filter, with an sr-only label
// (jsx-a11y label-has-associated-control). All copy via Paraglide (rule 4).

import { useId } from 'react'

import { m } from '@ehrbase-ui/i18n/messages'
import { Input } from './input.tsx'
import { Label } from './label.tsx'

interface DataTableToolbarProps {
  value: string
  onChange: (value: string) => void
}

export function DataTableToolbar({ value, onChange }: DataTableToolbarProps) {
  const inputId = useId()
  return (
    <div className="flex items-center">
      <Label htmlFor={inputId} className="sr-only">
        {m.data_table_filter_label()}
      </Label>
      <Input
        id={inputId}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={m.data_table_filter_placeholder()}
        className="max-w-xs"
      />
    </div>
  )
}
