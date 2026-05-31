// Patient banner — CLINICAL-UI.md §7.1 (patient header banner) + §6 (patient
// header model); openEHR Demographic IM PARTY_IDENTIFIED + EHR_STATUS.subject
// .external_ref (rule 10). ADR-0046.
//
// The persistent identity header shown on every patient-context route. Renders
// the clinical-safety identity set — name (Family, Given) + DOB (+ age) + sex +
// MRN (ADR-0046) — so a clinician can verify the patient at a glance (WHO/Joint-
// Commission two-identifier guidance). The ehr_id is NEVER shown: it is an
// internal handle resolved server-side. National identifiers are not shown here.
// rule 4 (all copy via Paraglide).

import { type Party } from '@ehrbase-ui/demographic-core'
import { m } from '@ehrbase-ui/i18n/messages'
import { Link } from '@tanstack/react-router'
import { type ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'

import { patientAge, patientDisplayName, patientMrn, patientSex } from './patient-identity'

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}

export function PatientBanner({
  party,
  ehrId,
  actions,
}: {
  party: Party
  /** Resolved server-side; used only to flag "no EHR linked" — never displayed. */
  ehrId: string | null
  /** Right-aligned controls (e.g. break-glass) supplied by the context layout. */
  actions?: ReactNode
}) {
  const name = patientDisplayName(party)
  const age = patientAge(party.birthDate)
  const mrn = patientMrn(party)
  const sex = patientSex(party)
  const deceased = party.deceased !== undefined && party.deceased !== false
  const dob = party.birthDate
    ? `${party.birthDate}${age !== null ? ` (${m.patient_banner_age({ age })})` : ''}`
    : '—'

  return (
    <section
      aria-label={name}
      className="bg-card sticky top-0 z-10 flex flex-wrap items-start justify-between gap-4 border-b px-4 py-3"
    >
      <div className="space-y-1">
        <Link to="/patients" className="text-muted-foreground hover:text-foreground text-xs">
          ← {m.patient_banner_back()}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">{name}</h1>
          {party.active ? null : (
            <Badge variant="destructive">{m.patient_banner_inactive()}</Badge>
          )}
          {deceased ? <Badge variant="destructive">{m.patient_banner_deceased()}</Badge> : null}
          {ehrId === null ? <Badge variant="outline">{m.patient_banner_no_ehr()}</Badge> : null}
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 pt-1 text-sm">
          <Fact label={m.patient_banner_dob()} value={dob} />
          {sex ? <Fact label={m.patient_banner_sex()} value={sex} /> : null}
          {mrn ? <Fact label={m.patient_banner_mrn()} value={mrn} /> : null}
        </dl>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </section>
  )
}
