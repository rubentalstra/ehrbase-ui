// Subject pseudonymization for audit records (docs/architecture.md §14.4).
//
// An audit line like "user X viewed patient Y" is itself health data. We never
// store a raw patient identifier (any national patient ID — BSN, NIR, KVNR,
// Codice Fiscale, PESEL, etc. — or EHR subject id) in the audit log —
// only subjectIdHash = HMAC-SHA256(subjectId, AUDIT_PSEUDONYM_SECRET). The
// HMAC is deterministic (the same subject always hashes to the same value, so
// auditors can correlate accesses to one patient) but irreversible without the
// secret, which is held in a separate KMS-protected store. This satisfies
// GDPR Art. 4(5).

import { createHmac } from 'node:crypto'

function secretKey(): string {
  const secret = process.env.AUDIT_PSEUDONYM_SECRET
  if (!secret) {
    throw new Error('AUDIT_PSEUDONYM_SECRET is not set — cannot pseudonymize audit subjects (§14.4).')
  }
  return secret
}

export function pseudonymizeSubject(subjectId: string): string {
  return createHmac('sha256', secretKey()).update(subjectId).digest('hex')
}
