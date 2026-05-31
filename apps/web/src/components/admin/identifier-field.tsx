// IdentifierField — a controlled namespace-picker + value input with live
// checksum validation (CLINICAL-UI.md §4 admin/patients; ADR-0031). Reused by
// the patient create/edit form (per-row) and the detail "add identifier" panel.
// Validation reuses the demographic-core registry validators (the SAME code the
// adapter enforces) so the UI hint and the server agree. shadcn primitives only.

import { validateIdentifier } from '@ehrbase-ui/demographic-core'
import { m } from '@ehrbase-ui/i18n/messages'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { IDENTIFIER_NAMESPACE_KEYS, nsLabel } from './identifier-namespaces.ts'

export interface IdentifierFieldProps {
  idPrefix: string
  namespace: string
  value: string
  onNamespaceChange: (namespace: string) => void
  onValueChange: (value: string) => void
  /** External error (e.g. a duplicate from the server); shown in addition to the live checksum hint. */
  error?: string
  disabled?: boolean
}

export function IdentifierField({
  idPrefix,
  namespace,
  value,
  onNamespaceChange,
  onValueChange,
  error,
  disabled,
}: IdentifierFieldProps) {
  // Live checksum hint: only once the user has typed a value, and only when the
  // namespace's validator actually rejects it. Submit-time validation in the
  // form schema is the authority; this is the inline UX hint.
  const liveInvalid = value.trim().length > 0 && !validateIdentifier(namespace, value).valid
  const hint = error ?? (liveInvalid ? m.admin_patients_identifier_invalid({ label: nsLabel(namespace) }) : undefined)
  const nsId = `${idPrefix}-ns`
  const valueId = `${idPrefix}-value`

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1 space-y-1">
        <Label htmlFor={nsId}>{m.admin_patients_search_identifier_ns()}</Label>
        <Select value={namespace} onValueChange={onNamespaceChange} disabled={disabled}>
          <SelectTrigger id={nsId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {IDENTIFIER_NAMESPACE_KEYS.map((key) => (
              <SelectItem key={key} value={key}>
                {nsLabel(key)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex-1 space-y-1">
        <Label htmlFor={valueId}>{m.admin_patients_identifier_value()}</Label>
        <Input
          id={valueId}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          disabled={disabled}
          aria-invalid={hint !== undefined}
          {...(hint ? { 'aria-describedby': `${valueId}-error` } : {})}
        />
        {hint ? (
          <p id={`${valueId}-error`} className="text-destructive text-xs">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  )
}
