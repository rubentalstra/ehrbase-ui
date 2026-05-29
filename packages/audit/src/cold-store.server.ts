// Cold-storage abstraction for archived audit events (docs/architecture.md
// §14.6; ADR-0027).
//
// Two concrete providers backed by the same @aws-sdk/client-s3 client:
//   - SeaweedFsColdStore — dev default, mode 'best-effort'. SeaweedFS accepts
//     the Object Lock COMPLIANCE API surface but does not actually enforce
//     WORM (seaweedfs#8350 closed "not planned" 2026-02-18). The warm
//     Postgres tier with the ADR-0013 trigger remains the authoritative
//     immutability layer.
//   - S3ColdStore — production WORM-compliant alternative. AWS S3 Object
//     Lock COMPLIANCE mode actually blocks DELETEs.
//
// Object key layout: audit/<yyyy>/<mm>/<dd>/<eventId>.json. Body: the canonical
// JSON form of the event row (same canonicalize() that drove the hash chain,
// so a restored cold object is verifiable against the chain).

import {
  HeadObjectCommand,
  ObjectLockMode,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3'

import { canonicalize } from './hash-chain.server'
import type { AuditEventRow, AuditRetentionPolicy } from './schema'

export type ColdStorageMode = 'best-effort' | 'worm-compliance'

export interface ColdStorageProvider {
  readonly mode: ColdStorageMode
  archive(event: AuditEventRow): Promise<string>
  verify(eventId: string, key: string): Promise<boolean>
}

// Retention years used to compute the cold-tier Object Lock RetainUntilDate.
// These mirror the per-policy warm-tier defaults in §14.7 but are upper-bound
// (the warm tier is shorter; the cold tier should outlive it).
const RETAIN_YEARS: Record<AuditRetentionPolicy, number> = {
  CLINICAL_RECORD: 20,
  AUDIT_LOG: 10,
  AUTH_LOG: 2,
  APP_LOG: 1,
  SESSION: 1,
}

export function objectKeyFor(event: {
  eventId: string
  timestamp: string
}): string {
  const date = new Date(event.timestamp)
  const yyyy = date.getUTCFullYear().toString()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return `audit/${yyyy}/${mm}/${dd}/${event.eventId}.json`
}

export function retainUntilDateFor(event: {
  timestamp: string
  retentionPolicy: AuditRetentionPolicy
}): Date {
  const start = new Date(event.timestamp)
  const years = RETAIN_YEARS[event.retentionPolicy]
  const d = new Date(start)
  d.setUTCFullYear(d.getUTCFullYear() + years)
  return d
}

function rowToBody(event: AuditEventRow): string {
  // Strip s3_archived_at so the body matches the canonical hash form (the
  // verifier excludes this column for the same reason). Mirrors the
  // canonicalize() exclusion in hash-chain.server.ts.
  const { s3ArchivedAt, hash, ...content } = event
  void s3ArchivedAt
  return JSON.stringify({ ...content, hash, body: canonicalize(content) })
}

function resolveLockMode(): ObjectLockMode {
  const raw = process.env.COLD_STORAGE_OBJECT_LOCK_MODE
  return raw === 'GOVERNANCE'
    ? ObjectLockMode.GOVERNANCE
    : ObjectLockMode.COMPLIANCE
}

abstract class AwsSdkColdStore implements ColdStorageProvider {
  abstract readonly mode: ColdStorageMode
  protected readonly bucket: string
  protected readonly client: S3Client

  constructor(bucket: string, config: S3ClientConfig) {
    this.bucket = bucket
    this.client = new S3Client(config)
  }

  async archive(event: AuditEventRow): Promise<string> {
    const key = objectKeyFor(event)
    const lockMode = resolveLockMode()
    const retainUntil = retainUntilDateFor(event)
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: rowToBody(event),
        ContentType: 'application/json',
        ObjectLockMode: lockMode,
        ObjectLockRetainUntilDate: retainUntil,
      }),
    )
    return key
  }

  async verify(_eventId: string, key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      )
      return true
    } catch {
      return false
    }
  }
}

export class SeaweedFsColdStore extends AwsSdkColdStore {
  readonly mode: ColdStorageMode = 'best-effort'
}

export class S3ColdStore extends AwsSdkColdStore {
  readonly mode: ColdStorageMode = 'worm-compliance'
}

// No-op provider used by unit tests + dev environments without a configured
// cold tier (COLD_STORAGE_PROVIDER=none). Logs the call site so deployments
// know nothing was actually durably archived. Non-async on the impl side —
// nothing awaits — so we satisfy the @typescript-eslint/require-await rule
// while still matching the Promise-returning interface contract.
export class NoopColdStore implements ColdStorageProvider {
  readonly mode: ColdStorageMode = 'best-effort'
  archive(event: AuditEventRow): Promise<string> {
    const key = objectKeyFor(event)
    console.warn(
      '[audit/cold-store] NO-OP archive (COLD_STORAGE_PROVIDER=none):',
      key,
    )
    return Promise.resolve(key)
  }
  verify(eventId: string, key: string): Promise<boolean> {
    void eventId
    void key
    return Promise.resolve(true)
  }
}
