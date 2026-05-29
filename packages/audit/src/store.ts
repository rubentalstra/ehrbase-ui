// Durable persistence for a fully-formed, validated audit event
// (docs/architecture.md §14.3, §14.6).
//
// Three sinks, in order of authority:
//   1. The `audit` database (warm tier, append-only) — the source of truth.
//   2. The Valkey chain head — so the next event can extend the chain.
//   3. A redundant NDJSON file on a persistent volume — survives a DB outage
//      and is the stream a log shipper (Promtail → Loki) tails in production.
//
// A failure in the NDJSON transport must never lose the event: the DB write is
// awaited first and is authoritative.

import { tmpdir } from 'node:os'
import { join } from 'node:path'

import pino, { type Logger } from 'pino'

import { auditDb } from '@ehrbase-ui/db-platform/client'
import { auditEvents } from '@ehrbase-ui/db-platform/audit'
import { setChainHead } from './hash-chain'
import type { AuditEventInsert } from './schema'

// Container deployments set AUDIT_LOG_PATH to the mounted audit_logs volume;
// host dev/CI falls back to a writable tmp path (the system /var/log path is
// not writable there). The DB is the source of truth — this NDJSON sink is
// redundant durability.
const auditLogPath =
  process.env.AUDIT_LOG_PATH ?? join(tmpdir(), 'ehrbase-ui-audit.ndjson')

// Dedicated audit stream — distinct from the application logger (§13.1).
// Lazily constructed so importing this module (which the dev SSR does eagerly)
// never touches the filesystem until an audit event is actually written.
//
// We use pino.multistream + pino.destination rather than the worker-thread
// `transport` API: worker transports fail in the bundled ESM server output
// with "__dirname is not defined". multistream writes synchronously to stdout
// (captured by the container runtime) and to the durable NDJSON file. No
// redaction here: the record is already pseudonymized upstream (§14.4).
let auditLogger: Logger | undefined
function getAuditLogger(): Logger {
  if (!auditLogger) {
    const fileDest = pino.destination({ dest: auditLogPath, mkdir: true, sync: false })
    // The destination flushes asynchronously, so a write failure (EACCES, full
    // disk, …) surfaces on the stream's 'error' event — NOT synchronously where
    // persistAuditEvent's try/catch could catch it. Without this handler an
    // unhandled 'error' becomes an uncaughtException that can crash the server.
    // The NDJSON sink is strictly redundant (the DB is the source of truth), so
    // we log and carry on.
    fileDest.on('error', (err: unknown) => {
      console.error(
        '[audit] NDJSON sink write failed (DB write already succeeded):',
        err instanceof Error ? err.message : err,
      )
    })
    auditLogger = pino(
      {
        level: 'info',
        base: { stream: 'audit' },
        timestamp: pino.stdTimeFunctions.isoTime,
      },
      pino.multistream([{ stream: process.stdout }, { stream: fileDest }]),
    )
  }
  return auditLogger
}

export async function persistAuditEvent(row: AuditEventInsert): Promise<void> {
  // 1. Source of truth: the append-only audit DB.
  await auditDb.insert(auditEvents).values(row)

  // 2. Advance the chain head so the next event links to this one.
  await setChainHead(row.hash)

  // 3. Redundant durable NDJSON. Strictly best-effort — a transport failure
  //    must never propagate, since the authoritative write already succeeded.
  try {
    getAuditLogger().info(row)
  } catch {
    // Swallow: the DB is the source of truth; the NDJSON is redundancy.
  }
}
