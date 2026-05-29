// OTel Collector config regression test.
//
// The collector emits deprecation warnings on every boot when the config
// uses dialect drift (e.g. `otlphttp` exporter alias, bare OTTL paths). We
// freeze the cleaned-up form here so a future edit of collector-config.yaml
// fails CI before it ships a noisy dev experience to the next operator.
//
// The asserts are intentionally string-level (no YAML parser) — the goal
// is to catch the specific deprecations that bit us, not to validate the
// full schema (that's the collector's own --dry-run job, which lives in
// `pnpm validate:otel-collector` for hospital deployments that want it).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const CONFIG_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'docker',
  'otel',
  'collector-config.yaml',
)

const config = readFileSync(CONFIG_PATH, 'utf8')

describe('apps/web/docker/otel/collector-config.yaml — boot-clean contract', () => {
  it('uses the canonical `otlp_http` exporter type, not the deprecated `otlphttp` alias', () => {
    // Deprecation fires when the live YAML keys start with `otlphttp/`
    // (e.g. `otlphttp/tempo:`) — comments mentioning the historical name
    // are fine. We strip `#`-prefixed comment text from each line before
    // looking for the offender substring.
    const offenders = config
      .split('\n')
      .map((line) => line.replace(/#.*$/, '').trimEnd())
      .filter((line) => /\botlphttp\b/.test(line))
    expect(
      offenders,
      `Live config lines using deprecated 'otlphttp' alias:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('uses context-prefixed OTTL paths (`span.name`, `span.attributes[...]`)', () => {
    // The unified OTTL parser-collection requires every path to begin with
    // its context name. `name` / `attributes[...]` bare forms emit a
    // "paths were modified to include their context prefix" warning on
    // every collector boot.
    const lines = config.split('\n')
    const ottlLines = lines.filter(
      (line) =>
        line.includes('replace_pattern(') ||
        line.includes('set(') ||
        line.includes('delete_key('),
    )
    // Each OTTL line must reference its target via the `span.` / `metric.`
    // / `log.` prefix when the call site is inside a `context: span/metric/
    // log` block. We only check span here because that's all our config has.
    for (const line of ottlLines) {
      const inBareName = /replace_pattern\(\s*name\b/.test(line)
      const inBareAttrs = /replace_pattern\(\s*attributes\[/.test(line)
      const whereBareAttrs = /where\s+attributes\[/.test(line)
      expect(
        inBareName,
        `Bare \`name\` in OTTL line (use \`span.name\`): ${line}`,
      ).toBe(false)
      expect(
        inBareAttrs,
        `Bare \`attributes[...]\` in OTTL line (use \`span.attributes[...]\`): ${line}`,
      ).toBe(false)
      expect(
        whereBareAttrs,
        `Bare \`where attributes[...]\` in OTTL line: ${line}`,
      ).toBe(false)
    }
  })

  it('declares the four-pipeline shape we depend on (traces + metrics + logs)', () => {
    expect(config).toMatch(/^\s+traces:/m)
    expect(config).toMatch(/^\s+metrics:/m)
    expect(config).toMatch(/^\s+logs:/m)
  })

  it('keeps the PHI-redaction layers wired in the traces pipeline', () => {
    // The traces pipeline must reference both layer-3 (attribute block-list)
    // and layer-4 (UUID catch-all) processors, plus tail_sampling.
    const tracesBlock =
      config.match(/^\s+traces:[\s\S]*?(?=^\s+(metrics|logs):|^[^\s])/m)?.[0] ??
      ''
    expect(tracesBlock).toContain('attributes/redact-phi')
    expect(tracesBlock).toContain('transform/redact-uuids')
    expect(tracesBlock).toContain('tail_sampling')
  })
})
