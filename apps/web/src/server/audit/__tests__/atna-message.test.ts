// Unit tests for the IHE-ATNA / DICOM AuditMessage builder (ADR-0041). Pure —
// no mocks. Asserts the action/outcome code mapping, the requestor + purpose-of-use,
// the patient + pseudonym participant objects (never a raw value), and schema validity.

import { describe, expect, it } from 'vitest'

import { AtnaAuditMessageSchema, buildAtnaMessage, type AuditAccessInput } from '../atna-message.ts'

const SOURCE = { auditSourceId: 'ehrbase-ui-test' }

function base(overrides: Partial<AuditAccessInput> = {}): AuditAccessInput {
  return {
    action: 'READ',
    outcome: 'SUCCESS',
    actor: { userId: 'u1', username: 'doc@example.test', roles: ['physician'] },
    resource: { type: 'PARTY', id: 'p1', isPatient: true },
    sourceComponent: 'bff',
    eventTime: '2026-05-31T10:00:00.000Z',
    ...overrides,
  }
}

describe('buildAtnaMessage', () => {
  it('maps the action to a DICOM EventActionCode', () => {
    const code = (a: AuditAccessInput['action']) =>
      buildAtnaMessage(base({ action: a }), SOURCE).eventIdentification.eventActionCode
    expect(code('CREATE')).toBe('C')
    expect(code('READ')).toBe('R')
    expect(code('UPDATE')).toBe('U')
    expect(code('DELETE')).toBe('D')
    expect(code('QUERY')).toBe('E')
    expect(code('EXECUTE')).toBe('E')
  })

  it('maps the outcome to the DICOM EventOutcomeIndicator', () => {
    expect(
      buildAtnaMessage(base({ outcome: 'SUCCESS' }), SOURCE).eventIdentification.eventOutcomeIndicator,
    ).toBe(0)
    expect(
      buildAtnaMessage(base({ outcome: 'FAILURE' }), SOURCE).eventIdentification.eventOutcomeIndicator,
    ).toBe(8)
  })

  it('records the requestor with role codes (purpose-of-use is NOT on the participant)', () => {
    const ap = buildAtnaMessage(base(), SOURCE).activeParticipants[0]
    expect(ap?.userId).toBe('u1')
    expect(ap?.userIsRequestor).toBe(true)
    expect(ap?.roleIdCodes.map((r) => r.code)).toContain('physician')
    // IHE ITI-20: PurposeOfUse lives in EventIdentification, not ActiveParticipant.
    expect(ap).not.toHaveProperty('purposeOfUse')
  })

  it('carries PurposeOfUse in EventIdentification, default TREAT, v3-ActReason coded', () => {
    const ei = buildAtnaMessage(base(), SOURCE).eventIdentification
    expect(ei.purposeOfUse?.code).toBe('TREAT')
    expect(ei.purposeOfUse?.codeSystemName).toBe('2.16.840.1.113883.1.11.20448')
  })

  it('honours an explicit purpose-of-use (BTG / break-the-glass)', () => {
    const ei = buildAtnaMessage(base({ purposeOfUse: 'BTG' }), SOURCE).eventIdentification
    expect(ei.purposeOfUse?.code).toBe('BTG')
    expect(ei.purposeOfUse?.displayName).toBe('break the glass')
  })

  it('emits a patient participant object + a subject pseudonym, never a raw value', () => {
    const msg = buildAtnaMessage(base({ subjectIdHash: 'deadbeef' }), SOURCE)
    const ids = msg.participantObjects.map((o) => o.objectId)
    expect(ids).toContain('p1')
    expect(ids).toContain('deadbeef')
    const patientObj = msg.participantObjects.find((o) => o.objectId === 'p1')
    expect(patientObj?.typeCode).toBe(1)
    expect(patientObj?.typeCodeRole).toBe(1)
  })

  it('produces a schema-valid AuditMessage (incl. enterprise-site id)', () => {
    expect(() =>
      AtnaAuditMessageSchema.parse(
        buildAtnaMessage(base(), { auditSourceId: 's', auditEnterpriseSiteId: 'site-1' }),
      ),
    ).not.toThrow()
  })
})
