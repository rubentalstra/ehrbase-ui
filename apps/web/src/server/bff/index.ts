// @/server/bff — BFF helpers used by every authed route.

export {
  isAllowedOrigin,
  issueCsrfToken,
  consumeCsrfToken,
} from './csrf.ts'
export {
  type RequestClass,
  classifyRequest,
  extractEhrId,
} from './ehrbase-proxy.ts'
export {
  type RateLimitClass,
  type RateLimitResult,
  checkRateLimit,
  tooManyRequests,
} from './rate-limit.ts'
export {
  generateNonce,
  applySecurityHeaders,
} from './security-headers.ts'
export { runWithNonce } from './nonce-context.ts'
