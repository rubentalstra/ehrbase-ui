// i18n completeness gate (docs/architecture.md §11.7). Run after
// `paraglide:compile` in CI.
//
// The generated Paraglide output (src/paraglide/**) is gitignored, so the
// originally-planned "compile + assert no git diff" check is a no-op here.
// What §11.7 actually wants is translation COMPLETENESS: every locale must
// define exactly the same message keys, so a release can never ship with a
// key that is present in one locale and missing in another (the TypeScript
// compiler already guarantees that every `m.key()` call resolves; this guards
// the complementary direction across locales). English-only today, this makes
// the Dutch addition safe by construction.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const MESSAGES_DIR = new URL('../messages/', import.meta.url).pathname

const files = readdirSync(MESSAGES_DIR).filter((f) => f.endsWith('.json'))
if (files.length === 0) {
  console.error('paraglide:check — no message files found in messages/')
  process.exit(1)
}

const META_KEYS = new Set(['$schema'])

/** @type {Map<string, Set<string>>} */
const keysByLocale = new Map()
for (const file of files) {
  const locale = file.replace(/\.json$/, '')
  const json = JSON.parse(readFileSync(join(MESSAGES_DIR, file), 'utf8'))
  const keys = new Set(Object.keys(json).filter((k) => !META_KEYS.has(k)))
  keysByLocale.set(locale, keys)
}

const allKeys = new Set()
for (const keys of keysByLocale.values()) {
  for (const key of keys) allKeys.add(key)
}

let ok = true
for (const [locale, keys] of keysByLocale) {
  const missing = [...allKeys].filter((k) => !keys.has(k))
  if (missing.length > 0) {
    ok = false
    console.error(
      `paraglide:check — locale "${locale}" is missing ${missing.length} key(s): ${missing.join(', ')}`,
    )
  }
}

if (!ok) {
  process.exit(1)
}
console.log(`paraglide:check — ${keysByLocale.size} locale(s), ${allKeys.size} keys, complete.`)
