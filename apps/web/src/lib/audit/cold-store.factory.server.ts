// Cold-store factory — env-driven provider selection (ADR-0027).
//
// COLD_STORAGE_PROVIDER picks one of:
//   - 'seaweedfs' — SeaweedFsColdStore, mode 'best-effort'. Dev default.
//   - 'aws'       — S3ColdStore, mode 'worm-compliance'. Production WORM.
//   - 'none'      — NoopColdStore, mode 'best-effort'. Unit tests / dev
//                   without a configured cold tier.
//
// On boot the factory logs `cold-tier mode: <best-effort|worm-compliance>` so
// the deployment sees in a deterministic place which compliance regime is in
// play. This is asserted-against in a unit test so a future env-var rename
// doesn't silently degrade the visibility.

import {
  NoopColdStore,
  S3ColdStore,
  SeaweedFsColdStore,
  type ColdStorageProvider,
} from './cold-store.server'

let _provider: ColdStorageProvider | undefined

function readEnv(): {
  provider: 'seaweedfs' | 'aws' | 'none'
  bucket: string
  region: string
  endpoint?: string
  accessKey?: string
  secretKey?: string
} {
  const raw = (process.env.COLD_STORAGE_PROVIDER ?? 'none').toLowerCase()
  if (raw !== 'seaweedfs' && raw !== 'aws' && raw !== 'none') {
    throw new Error(
      `COLD_STORAGE_PROVIDER must be one of seaweedfs|aws|none (got "${raw}")`,
    )
  }
  return {
    provider: raw,
    bucket: process.env.COLD_STORAGE_BUCKET ?? 'audit-archive',
    region: process.env.COLD_STORAGE_REGION ?? 'us-east-1',
    endpoint: process.env.COLD_STORAGE_ENDPOINT,
    accessKey: process.env.COLD_STORAGE_ACCESS_KEY,
    secretKey: process.env.COLD_STORAGE_SECRET_KEY,
  }
}

function build(): ColdStorageProvider {
  const env = readEnv()
  if (env.provider === 'none') {
    console.info(
      '[audit/cold-store] cold-tier mode: best-effort (provider=none, no archive)',
    )
    return new NoopColdStore()
  }
  if (env.accessKey === undefined || env.secretKey === undefined) {
    throw new Error(
      `COLD_STORAGE_ACCESS_KEY + COLD_STORAGE_SECRET_KEY required for provider=${env.provider}`,
    )
  }
  const credentials = {
    accessKeyId: env.accessKey,
    secretAccessKey: env.secretKey,
  }
  if (env.provider === 'seaweedfs') {
    if (!env.endpoint) {
      throw new Error('COLD_STORAGE_ENDPOINT required for provider=seaweedfs')
    }
    console.info(
      '[audit/cold-store] cold-tier mode: best-effort (provider=seaweedfs)',
    )
    return new SeaweedFsColdStore(env.bucket, {
      region: env.region,
      endpoint: env.endpoint,
      forcePathStyle: true,
      credentials,
    })
  }
  console.info(
    '[audit/cold-store] cold-tier mode: worm-compliance (provider=aws)',
  )
  return new S3ColdStore(env.bucket, {
    region: env.region,
    ...(env.endpoint ? { endpoint: env.endpoint } : {}),
    credentials,
  })
}

export function getColdStorageProvider(): ColdStorageProvider {
  if (!_provider) _provider = build()
  return _provider
}

// For unit tests that need a clean factory state across cases.
export function _resetColdStorageProviderForTests(): void {
  _provider = undefined
}
