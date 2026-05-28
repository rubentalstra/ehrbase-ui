// logAudit() — the single audit entry point (docs/architecture.md §14.3).
//
// Every PHI-touching server function and the BFF proxy call this. It is
// fire-and-forget for request latency but NEVER lossy: the durable DB write is
// awaited inside a serialized critical section, and any failure falls through
// to stderr so the container runtime still captures it.
//
// Flow: validate caller input → resolve source (request headers) → read chain
// head → build the flat row → compute the chained hash → validate the full row
// against the table-derived schema → persist (DB + chain head + NDJSON).

import { randomUUID } from 'node:crypto'

import { getRequestHeader } from '@tanstack/react-start/server'

import { computeHash, getChainHead } from './hash-chain.server'
import {
  AuditEventInsertSchema,
  LogAuditInputSchema,
  type AuditEventInsert,
  type LogAuditInput,
} from './schema'
import { persistAuditEvent } from './store.server'

// Reading request headers outside a request scope throws; tolerate that so the
// logger is usable from non-request contexts (scheduled jobs, tests).
function safeHeader(name: string): string | undefined {
  try {
    return getRequestHeader(name) ?? undefined
  } catch {
    return undefined
  }
}

// Serialize the read-head → insert → set-head critical section so concurrent
// events within this process produce a strictly linear chain (no forks).
let chainLock: Promise<unknown> = Promise.resolve()
function withChainLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chainLock.then(fn, fn)
  chainLock = run.catch(() => undefined)
  return run
}

export async function logAudit(input: LogAuditInput): Promise<void> {
  try {
    const parsedInput = LogAuditInputSchema.parse(input)

    await withChainLock(async () => {
      const previousHash = (await getChainHead()) ?? null

      const ipAddress =
        parsedInput.source?.ipAddress ??
        safeHeader('x-forwarded-for')?.split(',')[0]?.trim() ??
        safeHeader('x-real-ip') ??
        'unknown'

      const base: Omit<AuditEventInsert, 'hash'> = {
        eventId: randomUUID(),
        timestamp: new Date().toISOString(),
        actorUserId: parsedInput.actor.userId,
        actorUsername: parsedInput.actor.username,
        actorDisplayName: parsedInput.actor.displayName,
        actorRoles: parsedInput.actor.roles,
        actorOrganization: parsedInput.actor.organization ?? null,
        actorOnBehalfOf: parsedInput.actor.onBehalfOf ?? null,
        sourceIpAddress: ipAddress,
        sourceUserAgent:
          parsedInput.source?.userAgent ??
          safeHeader('user-agent') ??
          'unknown',
        sourceSessionId: parsedInput.source?.sessionId ?? 'anonymous',
        sourceCorrelationId:
          parsedInput.source?.correlationId ??
          safeHeader('x-correlation-id') ??
          randomUUID(),
        action: parsedInput.action,
        targetEhrId: parsedInput.target?.ehrId ?? null,
        targetSubjectIdHash: parsedInput.target?.subjectIdHash ?? null,
        targetResourceType: parsedInput.target?.resourceType ?? null,
        targetResourceId: parsedInput.target?.resourceId ?? null,
        targetArchetypeId: parsedInput.target?.archetypeId ?? null,
        purpose: parsedInput.purpose,
        outcome: parsedInput.outcome,
        outcomeDetail: parsedInput.outcomeDetail ?? null,
        retentionPolicy: parsedInput.retentionPolicy ?? 'AUDIT_LOG',
        s3ArchivedAt: null,
        previousHash,
      }

      const row = AuditEventInsertSchema.parse({
        ...base,
        hash: computeHash(base),
      })

      await persistAuditEvent(row)
    })
  } catch (err) {
    // Last resort: the container runtime still captures stderr. We log the
    // failure and the action, but NEVER the full input (it may carry PHI in a
    // way validation would have stripped).
    console.error('[audit] CRITICAL: failed to write audit event', {
      action: input.action,
      outcome: input.outcome,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
