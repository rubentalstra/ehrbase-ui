// Readiness aggregator for /api/ready (docs/architecture.md §13.4).
//
// Probes five subsystems in parallel with a 2-second timeout per probe:
//   - Valkey (session store + audit hash-chain head + rate limiter)
//   - EHRbase (BFF upstream — the clinical-data repository)
//   - Keycloak (identity provider — every authed request needs it)
//   - audit DB (NEN-7513 write target — ADR-0013 append-only)
//   - auth DB (Better Auth user/session tables — ADR-0029)
//
// Returns a 200 + a JSON envelope when all probes pass; 503 + the same
// envelope (with the failing probes' status set to 'fail') otherwise.
// CLAUDE.md Inviolable rule 2: the response body lists ONLY the subsystem
// name on failure, never the underlying error text — connection strings,
// pg-driver messages, and Redis hostnames can all carry sensitive deployment
// detail.
//
// Each probe is exported individually so unit tests can mock + recombine.

import { sql } from 'drizzle-orm'

import { auditDb } from '@ehrbase-ui/db-platform/client'
import { authDb } from '@ehrbase-ui/db-platform/auth-client'
import { valkey } from '@ehrbase-ui/valkey'

const PROBE_TIMEOUT_MS = 2_000

export type ProbeOutcome = 'ok' | 'fail'

export type ReadinessReport = {
  status: 'ready' | 'not_ready'
  checks: {
    valkey: ProbeOutcome
    ehrbase: ProbeOutcome
    keycloak: ProbeOutcome
    audit_db: ProbeOutcome
    auth_db: ProbeOutcome
  }
}

// withTimeout swallows the underlying error and returns 'fail' on either
// rejection or timeout. The reason text never leaves this module — only
// the boolean outcome reaches the response body (Inviolable rule 2).
async function withTimeout(fn: () => Promise<unknown>): Promise<ProbeOutcome> {
  try {
    const result = await Promise.race([
      fn().then(() => 'ok' as const),
      new Promise<'fail'>((resolve) =>
        setTimeout(() => resolve('fail'), PROBE_TIMEOUT_MS),
      ),
    ])
    return result
  } catch {
    return 'fail'
  }
}

export async function probeValkey(): Promise<ProbeOutcome> {
  return withTimeout(async () => {
    const reply = await valkey.ping()
    if (reply !== 'PONG') throw new Error('unexpected_ping_reply')
  })
}

export async function probeEhrbase(): Promise<ProbeOutcome> {
  return withTimeout(async () => {
    const base = process.env.EHRBASE_URL
    if (!base) throw new Error('ehrbase_url_unset')
    const url = new URL(base)
    // EHRbase 2.x exposes /management/health (actuator-style). Fall back to
    // the root REST surface if the management endpoint is firewalled off
    // in this deployment.
    const probeUrl = new URL('/management/health', url.origin).toString()
    const r = await fetch(probeUrl, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS - 50),
    })
    if (!r.ok) throw new Error(`ehrbase_status_${r.status}`)
  })
}

export async function probeKeycloak(): Promise<ProbeOutcome> {
  return withTimeout(async () => {
    // Prefer the internal issuer URL when set (works for docker-compose
    // service-to-service); fall back to the public issuer URL.
    const issuer =
      process.env.KEYCLOAK_INTERNAL_ISSUER_URL ?? process.env.KEYCLOAK_ISSUER_URL
    if (!issuer) throw new Error('keycloak_issuer_unset')
    const url = `${issuer}/.well-known/openid-configuration`
    const r = await fetch(url, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS - 50),
    })
    if (!r.ok) throw new Error(`keycloak_status_${r.status}`)
  })
}

export async function probeAuditDb(): Promise<ProbeOutcome> {
  return withTimeout(async () => {
    await auditDb.execute(sql`select 1`)
  })
}

export async function probeAuthDb(): Promise<ProbeOutcome> {
  return withTimeout(async () => {
    await authDb.execute(sql`select 1`)
  })
}

/**
 * Run every probe in parallel and return a 200 (ready) / 503 (not_ready)
 * Response with a JSON envelope listing per-subsystem outcomes.
 */
export async function checkReadiness(): Promise<Response> {
  const [valkeyCheck, ehrbaseCheck, keycloakCheck, auditCheck, authCheck] =
    await Promise.all([
      probeValkey(),
      probeEhrbase(),
      probeKeycloak(),
      probeAuditDb(),
      probeAuthDb(),
    ])

  const checks: ReadinessReport['checks'] = {
    valkey: valkeyCheck,
    ehrbase: ehrbaseCheck,
    keycloak: keycloakCheck,
    audit_db: auditCheck,
    auth_db: authCheck,
  }
  const allOk = Object.values(checks).every((v) => v === 'ok')
  const report: ReadinessReport = {
    status: allOk ? 'ready' : 'not_ready',
    checks,
  }

  return new Response(JSON.stringify(report), {
    status: allOk ? 200 : 503,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  })
}
