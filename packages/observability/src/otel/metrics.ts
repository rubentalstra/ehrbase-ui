// OTel metrics — getMeter() + the v1.0 custom counter registry
// (docs/architecture.md §13.3).
//
// Five custom counters are documented in §13.3. M5 ships the scaffolding +
// the two counters that have callers today; M6 + M16 wire the remaining
// three when those milestones land their write surfaces.
//
//   auth.login.attempts             — labelled `outcome=success|failure`
//                                     (wired by packages/auth's audit hook)
//   auth.token.refresh              — counter
//                                     (wired by packages/auth's refresh path)
//   bff.ehrbase.upstream.latency    — histogram, ms
//                                     (wired by apps/web BFF proxy)
//   bff.aql.query.duration          — histogram, ms          [M16 consumer]
//   bff.form.submission.failures    — counter, label=archetype [M6 consumer]
//
// Use via `getMeter().loginAttempts.add(1, { outcome: 'success' })` etc.
// — the wrapper hides the OTel API surface so callers don't need to
// import @opentelemetry/api directly.

import { metrics, type Histogram, type Counter } from '@opentelemetry/api'

export interface EhrbaseUiMeter {
  loginAttempts: Counter
  tokenRefresh: Counter
  ehrbaseUpstreamLatency: Histogram
  aqlQueryDuration: Histogram
  formSubmissionFailures: Counter
}

let cached: EhrbaseUiMeter | undefined

export function getMeter(): EhrbaseUiMeter {
  if (cached) return cached
  const meter = metrics.getMeter('ehrbase-ui', process.env.APP_VERSION ?? 'dev')
  cached = {
    loginAttempts: meter.createCounter('auth.login.attempts', {
      description:
        'Auth login attempts. Labelled by outcome (success/failure).',
    }),
    tokenRefresh: meter.createCounter('auth.token.refresh', {
      description: 'OAuth/OIDC refresh-token redemptions.',
    }),
    ehrbaseUpstreamLatency: meter.createHistogram(
      'bff.ehrbase.upstream.latency',
      {
        description:
          'Wall-clock latency of EHRbase upstream requests from the BFF.',
        unit: 'ms',
      },
    ),
    aqlQueryDuration: meter.createHistogram('bff.aql.query.duration', {
      description: 'AQL query execution time (BFF-side, end-to-end).',
      unit: 'ms',
    }),
    formSubmissionFailures: meter.createCounter(
      'bff.form.submission.failures',
      {
        description:
          'Composition write failures labelled by archetype id (no PHI).',
      },
    ),
  }
  return cached
}
