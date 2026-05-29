// Application-logger regression tests (docs/architecture.md §13.1).
//
// Why these tests exist
// ---------------------
// 1. In production, `pino.transport({ targets })` blew up every request
//    with `ReferenceError: __dirname is not defined in ES module scope`
//    inside Nitro's bundled ESM output (Pino's transport feature spawns a
//    worker_thread whose entry resolves modules via __dirname-based path
//    resolution — which is unavailable in bundled ESM). Fix: in production
//    mode the logger MUST be plain pino(), no transport, JSON-to-stdout.
//    Container runtimes ship the JSON lines to the OTel Collector via the
//    filelog receiver (12-factor pattern). This test pins that contract.
//
// 2. The OTel pino transport target is only attached in development. The
//    test asserts the dev path still produces a transport target so we
//    don't accidentally regress the local dev experience.

import { afterEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  process.env = { ...ORIGINAL_ENV }
})

describe('appLog factory — production vs dev shape (§13.1)', () => {
  it('uses bare pino(options) in production — no transport / no worker thread', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.OTEL_ENABLED

    const calls: Array<unknown> = []
    vi.doMock('pino', () => {
      const pinoMock = (opts: unknown) => {
        calls.push(opts)
        return {
          child: () => ({}),
        }
      }
      pinoMock.stdTimeFunctions = { isoTime: () => '' }
      return { default: pinoMock }
    })

    await import('../log/app.ts')

    expect(calls).toHaveLength(1)
    const opts = calls[0]
    if (typeof opts !== 'object' || opts === null) {
      throw new Error('pino called without options')
    }
    expect('transport' in opts).toBe(false)
  })

  it('attaches transport targets in development — pretty + stdout', async () => {
    process.env.NODE_ENV = 'development'
    delete process.env.OTEL_ENABLED

    const calls: Array<{ transport?: { targets: Array<{ target: string }> } }> =
      []
    vi.doMock('pino', () => {
      type Opts = { transport?: { targets: Array<{ target: string }> } }
      const pinoMock = (opts: Opts) => {
        calls.push(opts)
        return { child: () => ({}) }
      }
      pinoMock.stdTimeFunctions = { isoTime: () => '' }
      return { default: pinoMock }
    })

    await import('../log/app.ts')

    const opts = calls[0]
    expect(opts.transport).toBeDefined()
    const targets = opts.transport?.targets ?? []
    // stdout + pino-pretty (OTel target depends on OTEL_ENABLED).
    expect(targets.map((t) => t.target)).toEqual(
      expect.arrayContaining(['pino/file', 'pino-pretty']),
    )
  })

  it('adds the OTel pino transport target in dev when OTEL_ENABLED=true', async () => {
    process.env.NODE_ENV = 'development'
    process.env.OTEL_ENABLED = 'true'

    const calls: Array<{ transport?: { targets: Array<{ target: string }> } }> =
      []
    vi.doMock('pino', () => {
      type Opts = { transport?: { targets: Array<{ target: string }> } }
      const pinoMock = (opts: Opts) => {
        calls.push(opts)
        return { child: () => ({}) }
      }
      pinoMock.stdTimeFunctions = { isoTime: () => '' }
      return { default: pinoMock }
    })

    await import('../log/app.ts')

    const targets = calls[0].transport?.targets ?? []
    expect(targets.map((t) => t.target)).toContain(
      'pino-opentelemetry-transport',
    )
  })

  it('does NOT add the OTel transport in production even when OTEL_ENABLED=true', async () => {
    process.env.NODE_ENV = 'production'
    process.env.OTEL_ENABLED = 'true'

    const calls: Array<unknown> = []
    vi.doMock('pino', () => {
      const pinoMock = (opts: unknown) => {
        calls.push(opts)
        return { child: () => ({}) }
      }
      pinoMock.stdTimeFunctions = { isoTime: () => '' }
      return { default: pinoMock }
    })

    await import('../log/app.ts')

    const opts = calls[0]
    if (typeof opts !== 'object' || opts === null) {
      throw new Error('pino called without options')
    }
    expect('transport' in opts).toBe(false)
  })
})
