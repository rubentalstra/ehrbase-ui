// Request classification for the BFF EHRbase proxy (docs/architecture.md §5.9).
// Kept separate from the route so it is unit-testable without a request.

import type { RateLimitClass } from './rate-limit.ts'

// The openEHR REST verb + resource a call maps to. Used to pick the rate-limit
// class (and is surfaced for callers that want to label the request).
export type RequestAction = 'READ' | 'CREATE' | 'UPDATE' | 'DELETE' | 'QUERY'
export type RequestResourceType =
  | 'EHR'
  | 'COMPOSITION'
  | 'TEMPLATE'
  | 'QUERY'
  | 'CONTRIBUTION'
  | 'FOLDER'
  | 'SYSTEM'

export type RequestClass = {
  rateLimit: RateLimitClass
  action: RequestAction
  resourceType: RequestResourceType
}

// Maps an upstream openEHR REST call (method + path) onto the §5.9 rate-limit
// class plus a coarse action/resource label.
export function classifyRequest(method: string, path: string): RequestClass {
  const upper = method.toUpperCase()
  const p = path.toLowerCase()

  const resourceType: RequestResourceType = p.includes('query')
    ? 'QUERY'
    : p.includes('composition')
      ? 'COMPOSITION'
      : p.includes('template') || p.includes('definition')
        ? 'TEMPLATE'
        : p.includes('contribution')
          ? 'CONTRIBUTION'
          : p.includes('directory') || p.includes('folder')
            ? 'FOLDER'
            : p.includes('ehr')
              ? 'EHR'
              : 'SYSTEM'

  // AQL queries (POST/GET query/aql) get the stricter limit.
  if (p.includes('query')) {
    return { rateLimit: 'aql', action: 'QUERY', resourceType: 'QUERY' }
  }

  if (upper === 'GET' || upper === 'HEAD') {
    return { rateLimit: 'read', action: 'READ', resourceType }
  }
  if (upper === 'POST') {
    return { rateLimit: 'composition-write', action: 'CREATE', resourceType }
  }
  if (upper === 'PUT') {
    return { rateLimit: 'composition-write', action: 'UPDATE', resourceType }
  }
  if (upper === 'DELETE') {
    return { rateLimit: 'composition-write', action: 'DELETE', resourceType }
  }
  return { rateLimit: 'read', action: 'READ', resourceType }
}

// Best-effort EHR id extraction for the audit target (ehr/{uuid}/...).
const UUID_RE = /(?:^|\/)ehr\/([0-9a-f-]{36})/i
export function extractEhrId(path: string): string | undefined {
  return path.match(UUID_RE)?.[1]
}
