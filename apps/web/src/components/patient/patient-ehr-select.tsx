// PatientEhrSelect (ADR-0046). For workbench/dev surfaces that operate on one
// EHR: choose a patient by name/DOB/MRN and the resolved ehrId is surfaced to
// the caller — replacing the "paste an ehrId UUID" input. The ehrId is shown
// only as faint technical detail, never typed. rule 4.

import { type Party } from '@ehrbase-ui/demographic-core'
import { m } from '@ehrbase-ui/i18n/messages'
import { useState } from 'react'

import { patientDisplayName, patientMrn } from './patient-identity'
import { PatientPicker } from './patient-picker'

export function PatientEhrSelect({
  onChange,
}: {
  /** Called with the resolved ehrId (null if the patient has no EHR) + the party. */
  onChange: (ehrId: string | null, party: Party) => void
}) {
  const [party, setParty] = useState<Party | null>(null)
  const [noEhr, setNoEhr] = useState(false)

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-3">
        <PatientPicker
          triggerLabel={party ? m.patient_picker_change() : m.patient_picker_choose()}
          onPick={({ party: p, ehrId }) => {
            setParty(p)
            setNoEhr(ehrId === null)
            onChange(ehrId, p)
          }}
        />
        {party ? (
          <span className="text-sm">
            {patientDisplayName(party)}
            {patientMrn(party) ? ` · MRN ${patientMrn(party)}` : ''}
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">{m.workbench_pick_patient_hint()}</span>
        )}
      </div>
      {noEhr ? <p className="text-destructive text-sm">{m.patient_picker_no_ehr()}</p> : null}
    </div>
  )
}
