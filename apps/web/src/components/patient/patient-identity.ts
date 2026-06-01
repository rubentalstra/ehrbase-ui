// Human-centric patient identity helpers (ADR-0046). Patients are identified by
// name + DOB + MRN — never by a UUID/ehrId. Pure formatting over the canonical
// Party; the MRN is the short human record number; age derives from the DOB.
// Reuses patientDisplayName ("Family, Given"). All user-visible copy via Paraglide.

import { type Party } from '@ehrbase-ui/demographic-core'

import { patientDisplayName } from '@/components/admin/patient-display'

export { patientDisplayName }

/** The MRN registry namespace — the human record number (ADR-0046). */
const MRN_NAMESPACE = 'mrn'

/** The patient's active MRN (the human record number), or null. */
export function patientMrn(p: Party): string | null {
  return p.identifiers.find((i) => i.namespace === MRN_NAMESPACE && !i.end)?.value ?? null
}

/** Whole-years age from a (possibly partial YYYY / YYYY-MM) ISO birth date, or null. */
export function patientAge(birthDate: string | undefined): number | null {
  if (!birthDate) return null
  const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/u.exec(birthDate)
  if (!match) return null
  const year = Number(match[1])
  const month = match[2] ? Number(match[2]) : 1
  const day = match[3] ? Number(match[3]) : 1
  const now = new Date()
  let age = now.getFullYear() - year
  const hadBirthdayThisYear =
    now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() >= day)
  if (!hadBirthdayThisYear) age -= 1
  return age >= 0 && age < 200 ? age : null
}

/** The administrative sex/gender value (data, not a UI string), or null. */
export function patientSex(p: Party): string | null {
  return p.gender ?? null
}
