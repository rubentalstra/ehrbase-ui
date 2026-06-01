// PatientPicker (ADR-0046). A dialog that lets a user CHOOSE a patient by
// name/DOB/MRN instead of pasting a UUID/ehrId. On select it resolves the
// patient's ehrId server-side (getLinkedEhr) and calls onPick({ party, ehrId }).
// Reused by break-glass, the workbench surfaces, and patient-merge. rule 4.

import { type Party } from '@ehrbase-ui/demographic-core'
import { m } from '@ehrbase-ui/i18n/messages'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { getLinkedEhr } from '@/server/functions/patient.functions'

import { PatientSearch } from './patient-search'

export interface PickedPatient {
  party: Party
  /** Resolved server-side; null when the patient has no linked EHR. */
  ehrId: string | null
}

export function PatientPicker({
  onPick,
  triggerLabel,
  triggerVariant = 'outline',
  disabled,
}: {
  onPick: (picked: PickedPatient) => void
  triggerLabel: string
  triggerVariant?: 'default' | 'outline' | 'destructive' | 'secondary'
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const resolve = useMutation({
    mutationFn: (party: Party) =>
      getLinkedEhr({ data: { id: party.id } }).then((r) => ({ party, ehrId: r.ehrId })),
    onSuccess: (picked) => {
      onPick(picked)
      setOpen(false)
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant={triggerVariant} disabled={disabled}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{m.patient_picker_title()}</DialogTitle>
          <DialogDescription>{m.patient_picker_description()}</DialogDescription>
        </DialogHeader>
        <PatientSearch onSelect={(party) => resolve.mutate(party)} />
      </DialogContent>
    </Dialog>
  )
}
