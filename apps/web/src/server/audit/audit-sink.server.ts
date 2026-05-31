// PostgresAuditSink — wires the demographic provider's injected AuditSink port
// (demographic-core) to the IHE ATNA access trail (ADR-0041). The provider emits
// a PartyAuditEvent (already PHI-safe: opaque party id + HMAC `subjectIdHash`,
// machine-tag `detail`) on every op; this sink maps it to an AuditAccessInput and
// appends it via `auditAccess` (which never throws — a demographic op is never
// broken by an audit-DB hiccup).
//
// `.server.ts`: pulls the audit DB client through auditAccess — server-only.

import type { AuditSink, PartyAuditAction, PartyAuditEvent } from '@ehrbase-ui/demographic-core'

import { auditAccess } from './audit-access.server.ts'
import type { AuditAction } from './atna-message.ts'

const PARTY_ACTION: Record<PartyAuditAction, AuditAction> = {
  READ: 'READ',
  QUERY: 'QUERY',
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  // A merge / administrative mutation is a state change → UPDATE; `detail` carries
  // the precise op tag (e.g. 'merge').
  ADMIN_CHANGE: 'UPDATE',
}

export class PostgresAuditSink implements AuditSink {
  /** @param sourceComponent emitting component tag, e.g. 'demographic:builtin'. */
  constructor(private readonly sourceComponent: string) {}

  async record(event: PartyAuditEvent): Promise<void> {
    await auditAccess({
      action: PARTY_ACTION[event.action],
      outcome: event.outcome,
      actor: {
        userId: event.ctx.actor.userId,
        username: event.ctx.actor.username,
        roles: event.ctx.actor.roles,
      },
      purposeOfUse: 'TREATMENT',
      resource: { type: 'PARTY', ...(event.partyId ? { id: event.partyId } : {}), isPatient: true },
      ...(event.subjectIdHash ? { subjectIdHash: event.subjectIdHash } : {}),
      sourceComponent: this.sourceComponent,
      ...(event.ctx.correlationId ? { correlationId: event.ctx.correlationId } : {}),
      eventTime: new Date().toISOString(),
      ...(event.detail ? { detail: event.detail } : {}),
    })
  }
}
