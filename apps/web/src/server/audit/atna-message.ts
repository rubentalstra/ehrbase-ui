// IHE ATNA / DICOM AuditMessage model + builder (ADR-0041).
//
// EHRbase 2.31.0 ships no native access audit (ADR-0043), so the IHE ATNA access
// trail is the application's responsibility. This module builds a conformant
// DICOM Audit Message (RFC 3881 / DICOM PS3.15 "Audit Trail Message Format")
// object from an access event; `audit-access.server.ts` + the demographic
// `AuditSink` persist it to the `audit` Postgres schema. M9 adds the syslog/TLS
// forwarder to an external Audit Record Repository.
//
// PHI rule (CLAUDE.md rule 2): no name / DOB / raw national id ever enters a
// message. A patient is referenced by an opaque id and/or an HMAC-SHA256
// `subjectIdHash` pseudonym — never the raw value.
//
// Pure module: zod only, no node:crypto / DB / env side effects at import.

import { z } from 'zod'

/** DICOM EventActionCode. */
export const AtnaActionCodeSchema = z.enum(['C', 'R', 'U', 'D', 'E'])
export type AtnaActionCode = z.infer<typeof AtnaActionCodeSchema>

/** DICOM EventOutcomeIndicator: 0 success, 4 minor, 8 serious, 12 major failure. */
export const AtnaOutcomeSchema = z.union([
  z.literal(0),
  z.literal(4),
  z.literal(8),
  z.literal(12),
])
export type AtnaOutcome = z.infer<typeof AtnaOutcomeSchema>

/** A DICOM coded value (EV / CodedValueType). */
export const AtnaCodedValueSchema = z.object({
  code: z.string(),
  codeSystemName: z.string().optional(),
  displayName: z.string().optional(),
})
export type AtnaCodedValue = z.infer<typeof AtnaCodedValueSchema>

export const AtnaActiveParticipantSchema = z.object({
  userId: z.string(),
  altUserId: z.string().optional(),
  userName: z.string().optional(),
  userIsRequestor: z.boolean(),
  roleIdCodes: z.array(AtnaCodedValueSchema).default([]),
  networkAccessPointId: z.string().optional(),
  /** IHE XUA / BPPC PurposeOfUse, carried as a coded participant attribute. */
  purposeOfUse: AtnaCodedValueSchema.optional(),
})
export type AtnaActiveParticipant = z.infer<typeof AtnaActiveParticipantSchema>

export const AtnaParticipantObjectSchema = z.object({
  /** Opaque resource id (EHR id, party id) or HMAC pseudonym — never a raw national id. */
  objectId: z.string(),
  /** ParticipantObjectTypeCode: 1 person, 2 system, 3 organisation, 4 other. */
  typeCode: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  /** ParticipantObjectTypeCodeRole: 1 patient, 3 report, 6 user, 24 query … */
  typeCodeRole: z.number().int().optional(),
  idTypeCode: AtnaCodedValueSchema.optional(),
})
export type AtnaParticipantObject = z.infer<typeof AtnaParticipantObjectSchema>

export const AtnaAuditMessageSchema = z.object({
  eventIdentification: z.object({
    eventActionCode: AtnaActionCodeSchema,
    eventDateTime: z.string(),
    eventOutcomeIndicator: AtnaOutcomeSchema,
    eventId: AtnaCodedValueSchema,
    eventTypeCode: z.array(AtnaCodedValueSchema).default([]),
  }),
  activeParticipants: z.array(AtnaActiveParticipantSchema).min(1),
  auditSourceIdentification: z.object({
    auditSourceId: z.string(),
    auditEnterpriseSiteId: z.string().optional(),
    auditSourceTypeCode: z.array(AtnaCodedValueSchema).default([]),
  }),
  participantObjects: z.array(AtnaParticipantObjectSchema).default([]),
})
export type AtnaAuditMessage = z.infer<typeof AtnaAuditMessageSchema>

// ─── Access-event input (the app-facing shape) ──────────────────────────────

/** Verbs the app records; mapped to a DICOM EventActionCode below. */
export const AuditActionSchema = z.enum([
  'CREATE',
  'READ',
  'UPDATE',
  'DELETE',
  'QUERY',
  'EXECUTE',
  'ACCESS_DENIED',
])
export type AuditAction = z.infer<typeof AuditActionSchema>

export interface AuditAccessInput {
  action: AuditAction
  outcome: 'SUCCESS' | 'FAILURE'
  actor: { userId: string; username: string; roles: string[] }
  /** e.g. TREATMENT / EMERGENCY / RESEARCH; defaults to TREATMENT. */
  purposeOfUse?: string
  resource: { type: string; id?: string; isPatient?: boolean }
  /** HMAC-SHA256 pseudonym of a national identifier in scope (never the raw value). */
  subjectIdHash?: string
  /** The emitting component, e.g. 'demographic:builtin' or 'bff'. */
  sourceComponent: string
  correlationId?: string
  networkAccessPointId?: string
  /** ISO-8601 event time; the caller stamps it (modules stay side-effect-free). */
  eventTime: string
  /** Machine-readable tag only (e.g. 'create', 'search:identifier') — never PHI. */
  detail?: string
}

const ACTION_CODE: Record<AuditAction, AtnaActionCode> = {
  CREATE: 'C',
  READ: 'R',
  UPDATE: 'U',
  DELETE: 'D',
  QUERY: 'E',
  EXECUTE: 'E',
  ACCESS_DENIED: 'E',
}

const PURPOSE_CODE_SYSTEM = 'IHE:PurposeOfUse'
const AUDIT_SOURCE_TYPE_APPLICATION: AtnaCodedValue = {
  code: '4',
  codeSystemName: 'DCM',
  displayName: 'Application Server',
}

/**
 * Build a conformant IHE-ATNA DICOM AuditMessage from an access event.
 * `auditSourceId` / `auditEnterpriseSiteId` come from the caller (read from env
 * server-side) so this module stays pure + testable.
 */
export function buildAtnaMessage(
  input: AuditAccessInput,
  source: { auditSourceId: string; auditEnterpriseSiteId?: string },
): AtnaAuditMessage {
  const outcome: AtnaOutcome = input.outcome === 'SUCCESS' ? 0 : 8
  const purpose = input.purposeOfUse ?? 'TREATMENT'

  const requestor: AtnaActiveParticipant = {
    userId: input.actor.userId,
    userName: input.actor.username,
    userIsRequestor: true,
    roleIdCodes: input.actor.roles.map((r) => ({
      code: r,
      codeSystemName: 'ehrbase-ui:role',
    })),
    ...(input.networkAccessPointId
      ? { networkAccessPointId: input.networkAccessPointId }
      : {}),
    purposeOfUse: { code: purpose, codeSystemName: PURPOSE_CODE_SYSTEM },
  }

  const participantObjects: AtnaParticipantObject[] = []
  if (input.resource.id) {
    participantObjects.push({
      objectId: input.resource.id,
      typeCode: input.resource.isPatient ? 1 : 2,
      ...(input.resource.isPatient ? { typeCodeRole: 1 } : {}),
      idTypeCode: { code: input.resource.type, codeSystemName: 'ehrbase-ui:resource' },
    })
  }
  if (input.subjectIdHash) {
    participantObjects.push({
      objectId: input.subjectIdHash,
      typeCode: 1,
      typeCodeRole: 1,
      idTypeCode: { code: 'subjectIdHash', codeSystemName: 'ehrbase-ui:pseudonym' },
    })
  }

  return {
    eventIdentification: {
      eventActionCode: ACTION_CODE[input.action],
      eventDateTime: input.eventTime,
      eventOutcomeIndicator: outcome,
      eventId: {
        code: input.action,
        codeSystemName: 'ehrbase-ui:action',
        ...(input.detail ? { displayName: input.detail } : {}),
      },
      eventTypeCode: [
        { code: input.resource.type, codeSystemName: 'ehrbase-ui:resource' },
      ],
    },
    activeParticipants: [requestor],
    auditSourceIdentification: {
      auditSourceId: source.auditSourceId,
      ...(source.auditEnterpriseSiteId
        ? { auditEnterpriseSiteId: source.auditEnterpriseSiteId }
        : {}),
      auditSourceTypeCode: [AUDIT_SOURCE_TYPE_APPLICATION],
    },
    participantObjects,
  }
}
