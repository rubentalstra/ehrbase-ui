// @ehrbase-ui/http-bff — BFF helpers used by every authed route.

export {
  isAllowedOrigin,
  issueCsrfToken,
  consumeCsrfToken,
} from './csrf.server.ts'
export {
  type RequestClass,
  classifyRequest,
  extractEhrId,
} from './ehrbase-proxy.server.ts'
export {
  type RateLimitClass,
  type RateLimitResult,
  checkRateLimit,
  tooManyRequests,
} from './rate-limit.server.ts'
export {
  generateNonce,
  applySecurityHeaders,
} from './security-headers.server.ts'
export { runWithNonce } from './nonce-context.server.ts'
