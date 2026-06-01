// Patient context (ADR-0046). The $patientId layout resolves the patient + their
// ehrId once (getPatientContext) and provides it here; child routes read it via
// usePatientContext() — so a clinical surface operates inside a selected patient
// with the ehr_id available WITHOUT ever exposing or typing it.

import { type Party } from '@ehrbase-ui/demographic-core'
import { createContext, use, type ReactNode } from 'react'

export interface PatientContextValue {
  party: Party
  /** Resolved server-side; null when no EHR is linked yet. Never rendered raw. */
  ehrId: string | null
}

const PatientContext = createContext<PatientContextValue | null>(null)

export function PatientContextProvider({
  value,
  children,
}: {
  value: PatientContextValue
  children: ReactNode
}) {
  return <PatientContext value={value}>{children}</PatientContext>
}

export function usePatientContext(): PatientContextValue {
  const value = use(PatientContext)
  if (!value) {
    throw new Error('usePatientContext must be used within a /patients/$patientId route')
  }
  return value
}
