// TagsInput — a multi-token / chip input (CLINICAL-UI.md §4 admin/patients).
// The official @shadcn registry ships no tags-input primitive (checked), so this
// is composed from the existing Badge + Input primitives (rule 6: registry-first,
// then compose). Used for given names — each token is a separate given name —
// and reusable for any string[] field. Add on Enter or comma, remove with the ×
// or Backspace-on-empty. Controlled; the value is the canonical string[].

import { XIcon } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export interface TagsInputProps {
  id?: string
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  ariaLabel?: string
  /** Localised remove-button label, e.g. (tag) => m.admin_patients_form_tag_remove({ name: tag }). */
  removeLabel: (tag: string) => string
  disabled?: boolean
}

export function TagsInput({
  id,
  value,
  onChange,
  placeholder,
  ariaLabel,
  removeLabel,
  disabled,
}: TagsInputProps) {
  const [draft, setDraft] = useState('')

  function commit(raw: string): void {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (parts.length === 0) return
    const next = [...value]
    for (const p of parts) if (!next.includes(p)) next.push(p)
    onChange(next)
    setDraft('')
  }

  function removeAt(index: number): void {
    onChange(value.filter((_, i) => i !== index))
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit(draft)
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      e.preventDefault()
      removeAt(value.length - 1)
    }
  }

  return (
    <div
      className={cn(
        'border-input flex min-h-8 flex-wrap items-center gap-1.5 rounded-lg border bg-transparent px-2 py-1',
        'focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-3',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      {value.map((tag, i) => (
        <Badge key={tag} variant="secondary" className="gap-1">
          {tag}
          <button
            type="button"
            onClick={() => removeAt(i)}
            aria-label={removeLabel(tag)}
            className="hover:bg-secondary-foreground/20 -mr-0.5 rounded-full p-0.5"
          >
            <XIcon className="size-3" aria-hidden="true" />
          </button>
        </Badge>
      ))}
      <input
        id={id}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => commit(draft)}
        placeholder={value.length === 0 ? placeholder : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        className="placeholder:text-muted-foreground h-6 min-w-24 flex-1 bg-transparent text-sm outline-none"
      />
    </div>
  )
}
