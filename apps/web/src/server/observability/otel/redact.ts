// PHI redaction helpers — used by both the OTel SDK request-hook + custom
// SpanProcessor (in this package, layers 1 + 2 of the §13.2 four-layer
// strategy) and by the collector-tier `attributes` + `transform` processors
// (layers 3 + 4, declared in apps/web/docker/otel/collector-config.yaml).
//
// docs/architecture.md §13.2.
//
// Architecturally the SDK runs in-process so it can erase data BEFORE the
// span leaves the host. The collector layers are defence-in-depth: they
// catch attributes the in-process filter missed (e.g. spans emitted by
// EHRbase or Keycloak that share our collector). The two halves use the
// same regex source — UUID pattern + national-patient-ID + credential
// block-list — exported here so the regex can be unit-tested without
// booting the SDK.

const UUID_PATTERN = /[0-9a-f-]{36}/gi

/**
 * PHI / credential attribute-key block-list. Matches case-insensitively against
 * span-attribute keys. Mirrors the apps/web/docker/otel/collector-config.yaml
 * `attributes` processor pattern.
 *
 * National-patient-ID synonyms (BSN, NISS, NIR, KVNR, etc.) come from
 * docs/architecture.md §14.4 + the §14.6 deployment overlay.
 */
export const PHI_ATTRIBUTE_KEY_PATTERN = new RegExp(
  '^(' +
    // credentials
    'password|passwd|secret|token|access_token|refresh_token|id_token|' +
    'authorization|cookie|set-cookie|' +
    // direct PHI
    'email|' +
    // national patient identifiers (architecture §14.4)
    'bsn|niss|nir|kvnr|pesel|codice_fiscale|tis|nuts|bpk|mrn|' +
    // request-body / db statements (can contain PHI in their bodies)
    'http\\.url\\.query|db\\.statement|request\\.body' +
    ')$',
  'i',
)

/**
 * PHI redaction layer 1 — SDK requestHook. Strips query strings from the
 * URL and replaces UUIDs in the path with `:id` so span names never embed
 * patient-bound identifiers. Exported as a pure function so the unit test
 * can exercise it without booting the SDK.
 */
export function redactHttpRequestPath(url: string): string {
  const pathOnly = url.split('?')[0] ?? ''
  return pathOnly.replace(UUID_PATTERN, ':id')
}

/**
 * Returns `true` if the given attribute key matches the PHI block-list and
 * should be replaced with `'[REDACTED]'` in the span. Used by the in-process
 * SpanProcessor (layer 2 of §13.2).
 */
export function isPhiAttributeKey(key: string): boolean {
  return PHI_ATTRIBUTE_KEY_PATTERN.test(key)
}

/**
 * Catch-all UUID redaction over a free-form string (e.g. span name).
 * Mirrors the collector-tier `transform` processor's `replace_pattern`.
 */
export function redactUuidsInString(input: string): string {
  return input.replace(UUID_PATTERN, ':id')
}

/**
 * Defence-in-depth wrapper: given a (possibly nested) attribute value,
 * return either the input or `'[REDACTED]'`. Strings get UUID-stripped;
 * anything that looks like a token-shaped string is also redacted.
 */
export function redactAttributeValue(value: unknown): unknown {
  if (typeof value === 'string') return redactUuidsInString(value)
  return value
}
