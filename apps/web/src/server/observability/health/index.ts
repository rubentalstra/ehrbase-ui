// @/server/observability/health — readiness aggregator + probes
// (docs/architecture.md §13.4).

export {
  checkReadiness,
  probeValkey,
  probeEhrbase,
  probeKeycloak,
  probeAuthDb,
  probeDemographicDb,
  type ProbeOutcome,
  type ReadinessReport,
} from './checks.ts'
