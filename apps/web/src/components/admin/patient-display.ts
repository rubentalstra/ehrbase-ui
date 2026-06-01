// Display helpers for patient lists/detail (CLINICAL-UI.md §4 admin/patients).
// Pure formatting over the canonical Party; all copy via Paraglide (rule 4).

import { type Party } from '@ehrbase-ui/demographic-core'
import { m } from '@ehrbase-ui/i18n/messages'

import { nsLabel } from './identifier-namespaces.ts'

/** "Family, Given" from the official (or first) name, with safe fallbacks. */
export function patientDisplayName(p: Party): string {
  const name = p.names.find((n) => n.use === 'official') ?? p.names[0]
  if (!name) return m.admin_patients_value_none()
  const given = (name.given ?? []).join(' ')
  const composed = [name.family, given].filter(Boolean).join(', ')
  return composed || name.text || m.admin_patients_value_none()
}

/** "BSN (Netherlands): 123 +2" — the first identifier + a count of the rest. */
export function identifierSummary(p: Party): string {
  const first = p.identifiers[0]
  if (!first) return m.admin_patients_value_none()
  const extra = p.identifiers.length > 1 ? ` +${p.identifiers.length - 1}` : ''
  return `${nsLabel(first.namespace)}: ${first.value}${extra}`
}
