// Tamper-evident hash chain over audit events (docs/architecture.md §14.5).
//
// Each event embeds the SHA-256 of the previous event's canonical form (via
// the `previousHash` column), and its own `hash` is the SHA-256 of its
// canonical form INCLUDING that previousHash. Modifying any past event
// therefore invalidates every hash after it. The chain "head" — the hash of
// the most recent event — is kept in Valkey under `audit:lastHash`.

import { createHash } from 'node:crypto'

import { valkey } from '@/lib/valkey.server'

export const CHAIN_HEAD_KEY = 'audit:lastHash'

// Canonical JSON for a flat audit row, excluding the `hash` field AND any
// post-insert bookkeeping columns (currently: `s3ArchivedAt` — set by the M4
// retention purge job when an event lands in cold storage; flipping it must
// not invalidate the integrity hash chain). Keys are sorted so the
// serialization is stable regardless of property insertion order. The row is
// flat (only primitives + the actorRoles string array), so the
// sorted-key-array form of JSON.stringify is fully deterministic.
const HASH_EXCLUDED_KEYS = new Set(['s3ArchivedAt'])
export function canonicalize(row: Record<string, unknown>): string {
  const keys = Object.keys(row)
    .filter((k) => !HASH_EXCLUDED_KEYS.has(k))
    .sort()
  return JSON.stringify(row, keys)
}

export function computeHash(row: Record<string, unknown>): string {
  return createHash('sha256').update(canonicalize(row)).digest('hex')
}

export async function getChainHead(): Promise<string | null> {
  return valkey.get(CHAIN_HEAD_KEY)
}

export async function setChainHead(hash: string): Promise<void> {
  await valkey.set(CHAIN_HEAD_KEY, hash)
}
