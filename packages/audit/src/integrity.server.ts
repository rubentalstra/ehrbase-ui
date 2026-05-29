// Audit chain integrity verification (docs/architecture.md §14.5).
//
// Recomputes every event's hash from its stored content and walks the
// previousHash links to prove the chain is a single unbroken sequence. Used by
// a unit/integration test now and by the nightly DPO-alerting job later.
//
// Two independent checks:
//   1. Content integrity — each row's stored `hash` must equal the SHA-256 of
//      its canonical content. Detects in-place tampering.
//   2. Link integrity — the rows must form exactly one chain from the genesis
//      event (previousHash = null) with no breaks, forks, or orphans. Detects
//      deletion and reordering.

import { auditDb } from '@ehrbase-ui/db-platform/client'
import { auditEvents } from '@ehrbase-ui/db-platform/audit'
import { computeHash } from './hash-chain.server'
import type { AuditEventInsert } from './schema'

export type IntegrityResult = {
  valid: boolean
  count: number
  errors: string[]
}

export async function verifyAuditChain(): Promise<IntegrityResult> {
  const rows = await auditDb.select().from(auditEvents)
  const errors: string[] = []

  // 1. Content integrity.
  const byHash = new Map<string, (typeof rows)[number]>()
  for (const row of rows) {
    const { hash, ...content } = row
    const recomputed = computeHash(content)
    if (recomputed !== hash) {
      errors.push(`event ${row.eventId}: stored hash does not match content`)
    }
    if (byHash.has(hash)) {
      errors.push(`duplicate hash ${hash} (events ${byHash.get(hash)?.eventId} and ${row.eventId})`)
    }
    byHash.set(hash, row)
  }

  // 2. Link integrity — walk from the genesis event.
  if (rows.length > 0) {
    const genesis = rows.filter((r) => r.previousHash === null)
    if (genesis.length !== 1) {
      errors.push(`expected exactly one genesis event, found ${genesis.length}`)
    } else {
      const byPrev = new Map<string, (typeof rows)[number]>()
      for (const row of rows) {
        if (row.previousHash !== null) byPrev.set(row.previousHash, row)
      }
      let cursor: (typeof rows)[number] | undefined = genesis[0]
      let walked = 0
      while (cursor) {
        walked += 1
        cursor = byPrev.get(cursor.hash)
      }
      if (walked !== rows.length) {
        errors.push(`chain walk covered ${walked} of ${rows.length} events (break or fork)`)
      }
    }
  }

  return { valid: errors.length === 0, count: rows.length, errors }
}

// Exposed for tests that need to assert the canonical-hash relationship
// without a database round-trip.
export function recomputeHash(content: Omit<AuditEventInsert, 'hash'>): string {
  return computeHash(content)
}
