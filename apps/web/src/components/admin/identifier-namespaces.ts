// Identifier-namespace UI helpers (CLINICAL-UI.md §4 admin/patients; ADR-0031).
// Bridges the demographic-core identifier registry (the single source of truth
// for national-ID schemes + checksum validators) to Paraglide UI labels — the
// registry's `label` is a developer tag, never UI copy (rule 4).

import { IDENTIFIER_NAMESPACES } from '@ehrbase-ui/demographic-core'
import { m } from '@ehrbase-ui/i18n/messages'

/** Ordered namespace keys for the picker (NL first, local MRN last). */
export const IDENTIFIER_NAMESPACE_KEYS = Object.keys(IDENTIFIER_NAMESPACES)

// Explicit key → message-fn map (no dynamic `m[...]` indexing, no `as`; rule 3).
const NS_LABEL: Record<string, () => string> = {
  'nl-bsn': m.admin_patients_ns_nl_bsn,
  'be-niss': m.admin_patients_ns_be_niss,
  'fr-nir': m.admin_patients_ns_fr_nir,
  'de-kvnr': m.admin_patients_ns_de_kvnr,
  'it-cf': m.admin_patients_ns_it_cf,
  'es-dni': m.admin_patients_ns_es_dni,
  'pt-nif': m.admin_patients_ns_pt_nif,
  'at-bpk': m.admin_patients_ns_at_bpk,
  'pl-pesel': m.admin_patients_ns_pl_pesel,
  mrn: m.admin_patients_ns_mrn,
}

/** Localised label for a namespace key; falls back to the raw key if unmapped. */
export function nsLabel(key: string): string {
  const fn = NS_LABEL[key]
  return fn ? fn() : key
}
