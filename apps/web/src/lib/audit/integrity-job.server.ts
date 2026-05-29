// Nightly audit-chain integrity job (docs/architecture.md §14.5).
//
// Thin alerting wrapper over verifyAuditChain(). On a failed verification,
// emit a structured Pino error line AND (if configured) POST the report to
// DPO_ALERT_WEBHOOK so an external alert manager picks it up. The verifier
// itself is unchanged; this layer just turns a soft 'valid: false' return
// into an operationally-actionable signal.

import { randomUUID } from 'node:crypto'

import pino from 'pino'

import { verifyAuditChain, type IntegrityResult } from './integrity.server'

const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { module: 'audit/integrity-job' },
})

export type IntegrityJobReport = IntegrityResult & {
  jobId: string
  startedAt: string
  finishedAt: string
  alertDelivered: boolean
}

async function postToDpoWebhook(report: IntegrityJobReport): Promise<boolean> {
  const url = process.env.DPO_ALERT_WEBHOOK
  if (!url) return false
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'audit-chain-break',
        jobId: report.jobId,
        finishedAt: report.finishedAt,
        count: report.count,
        errors: report.errors,
      }),
    })
    return res.ok
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : String(err) },
      'dpo-alert webhook POST failed',
    )
    return false
  }
}

export async function runIntegrityJob(): Promise<IntegrityJobReport> {
  const jobId = randomUUID()
  const startedAt = new Date().toISOString()
  const result = await verifyAuditChain()
  const finishedAt = new Date().toISOString()

  const base: IntegrityJobReport = {
    ...result,
    jobId,
    startedAt,
    finishedAt,
    alertDelivered: false,
  }

  if (result.valid) {
    log.info(
      { jobId, count: result.count, startedAt, finishedAt },
      'audit-chain integrity verified',
    )
    return base
  }

  log.error(
    {
      jobId,
      count: result.count,
      errors: result.errors,
      startedAt,
      finishedAt,
    },
    'audit-chain integrity FAILED — DPO alert',
  )
  const delivered = await postToDpoWebhook(base)
  return { ...base, alertDelivered: delivered }
}
