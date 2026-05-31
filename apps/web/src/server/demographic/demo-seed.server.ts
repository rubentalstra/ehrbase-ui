// Dev demo-data seed (docs/DEV-DEMO-DATA.md; CLAUDE.md rule 14). Populates a
// handful of demographic patients so every admin/patients surface is observable
// the moment you spin up the dev stack — and so e2e runs against real rows.
//
// GATING: only when `SEED_DEMO_DATA === 'true'` AND NODE_ENV !== 'production'.
// In production (or with the flag unset) this is a no-op — the guard plus the
// NODE_ENV check make demo PHI-shaped data impossible to seed into a real deploy.
//
// IDEMPOTENT: keyed on a marker MRN (DEMO-0001). Re-running (server restart, a
// second list load) finds the marker and skips. Memoised per process so the
// first patients-list request awaits the seed once; later requests are free.
//
// Seeds the DEMOGRAPHIC side only (the M7 surface). Linked EHRs / compositions
// are NOT seeded here (EHR provisioning needs a user/service EHRbase token) — a
// demo patient shows "No EHR linked / Provision EHR", and the create-patient
// flow + e2e exercise auto-provisioning. Later milestones extend the seed with
// clinical demo data behind the same flag.
//
// `.server.ts`: uses the provider factory + env — never reaches the client.

import { type CreatePartyInput, type ProviderContext } from '@ehrbase-ui/demographic-core'

import { appLog } from '@/server/observability/log'

import { getDemographicProvider } from './provider.factory.server.ts'

const MARKER = { namespace: 'mrn', value: 'DEMO-0001' }

// System actor for seed attribution (audited via the provider's PostgresAuditSink).
function seedContext(): ProviderContext {
  return {
    actor: {
      userId: 'demo-seed',
      username: 'demo-seed',
      displayName: 'Demo Seeder',
      roles: ['admin'],
    },
    sessionId: 'demo-seed',
    correlationId: crypto.randomUUID(),
  }
}

// Varied, GDPR-test-safe synthetic patients. MRNs are opaque (always valid); the
// one BSN is a 99999-range test value that passes the 11-proef checksum.
const DEMO_PATIENTS: CreatePartyInput[] = [
  {
    identifiers: [MARKER, { namespace: 'nl-bsn', value: '999990019' }],
    names: [{ use: 'official', family: 'de Vries', given: ['Anna'], prefix: [], suffix: [] }],
    gender: 'female',
    birthDate: '1985-03-12',
    addresses: [{ lines: ['Keizersgracht 123'], city: 'Amsterdam', postalCode: '1015 CJ', country: 'NL' }],
    contacts: [
      { system: 'phone', value: '+31 20 555 0101' },
      { system: 'email', value: 'anna.devries@example.test' },
    ],
  },
  {
    identifiers: [{ namespace: 'mrn', value: 'DEMO-0002' }],
    names: [{ use: 'official', family: 'Janssen', given: ['Pieter'], prefix: [], suffix: [] }],
    gender: 'male',
    birthDate: '1972-11-05',
    addresses: [{ lines: ['Coolsingel 40'], city: 'Rotterdam', postalCode: '3011 AD', country: 'NL' }],
    contacts: [{ system: 'phone', value: '+31 10 555 0102' }],
  },
  {
    identifiers: [{ namespace: 'mrn', value: 'DEMO-0003' }],
    names: [{ use: 'official', family: 'El Amrani', given: ['Sara'], prefix: [], suffix: [] }],
    gender: 'female',
    birthDate: '1990-07-22',
    addresses: [],
    contacts: [{ system: 'email', value: 'sara.elamrani@example.test' }],
  },
  {
    identifiers: [{ namespace: 'mrn', value: 'DEMO-0004' }],
    names: [{ use: 'official', family: 'Bakker', given: ['Tom'], prefix: [], suffix: [] }],
    gender: 'male',
    birthDate: '1965-01-30',
    addresses: [],
    contacts: [],
  },
  {
    identifiers: [{ namespace: 'mrn', value: 'DEMO-0005' }],
    names: [{ use: 'official', family: 'Visser', given: ['Lotte'], prefix: [], suffix: [] }],
    gender: 'female',
    birthDate: '2012-09-18',
    addresses: [],
    contacts: [],
  },
  {
    identifiers: [{ namespace: 'mrn', value: 'DEMO-0006' }],
    names: [{ use: 'official', family: 'Smit', given: ['Jan'], prefix: [], suffix: [] }],
    gender: 'male',
    birthDate: '1948-12-02',
    addresses: [{ lines: ['Vrijthof 1'], city: 'Maastricht', postalCode: '6211 LD', country: 'NL' }],
    contacts: [],
  },
]

function enabled(): boolean {
  return process.env.SEED_DEMO_DATA === 'true' && process.env.NODE_ENV !== 'production'
}

async function runSeed(): Promise<void> {
  if (!enabled()) return
  const provider = getDemographicProvider()
  const ctx = seedContext()
  try {
    const existing = await provider.searchParty(
      { identifier: MARKER, limit: 1, offset: 0 },
      ctx,
    )
    if (existing.total > 0) return // already seeded

    let created = 0
    for (const input of DEMO_PATIENTS) {
      await provider.createParty(input, seedContext())
      created += 1
    }
    appLog.info({ created }, 'demo patients seeded (SEED_DEMO_DATA)')
  } catch (err) {
    // Never block a request on a seed failure (dev convenience, not correctness).
    appLog.warn(
      { err: err instanceof Error ? err.message : 'unknown' },
      'demo-data seed failed',
    )
  }
}

let seedPromise: Promise<void> | undefined

/**
 * Ensure dev demo data exists (idempotent, memoised, no-op unless SEED_DEMO_DATA
 * is on in a non-prod env). Awaited by the patients-list entry points so the
 * first load shows seeded data; subsequent calls reuse the resolved promise.
 */
export function ensureDemoSeed(): Promise<void> {
  seedPromise ??= runSeed()
  return seedPromise
}

/** Test seam: drop the memoised seed so a test can re-trigger it. */
export function _resetDemoSeedForTests(): void {
  seedPromise = undefined
}
