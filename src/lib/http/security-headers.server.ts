// Security response headers + CSP (docs/architecture.md §5.7).
//
// A fresh nonce is minted per request (see src/start.ts) and threaded into the
// SSR document via router.options.ssr.nonce, so React's hydration script
// carries it. script-src uses nonce + 'strict-dynamic' — OWASP's recommended
// XSS defense, which SSR makes possible. style-src is the one relaxation:
// 'unsafe-inline' for inline style attributes emitted by Radix + the sidebar
// (see buildCsp). Scripts remain locked to the nonce.
//
// Enforcement posture (§5.7): the enforcing Content-Security-Policy ships in
// production; in dev/staging we ship Content-Security-Policy-Report-Only so
// the Vite HMR client and other dev-only inline scripts are not blocked, and
// violations post to /api/csp-report for tuning before they ever enforce.

import { randomBytes } from 'node:crypto'

const isProduction = process.env.NODE_ENV === 'production'

export function generateNonce(): string {
  return randomBytes(16).toString('base64')
}

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // style-src keeps 'unsafe-inline' deliberately: Radix primitives
    // (dropdown, collapsible, command, tooltip, sheet) and the shadcn sidebar
    // emit inline `style` ATTRIBUTES for measured positioning/animation that a
    // nonce cannot cover (nonces apply to <style> elements, not attributes).
    // This is a style-only relaxation; script-src stays on nonce +
    // 'strict-dynamic', so XSS via script injection is still blocked. The
    // tradeoff is recorded in docs/adr/0014-ui-state-and-data-layer.md.
    `style-src 'self' 'unsafe-inline'`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ')
}

// PHI must never reach a disk cache (§5.7). Authed surfaces are no-store; the
// static asset paths keep their long-cache headers (set elsewhere).
function isAuthedPath(pathname: string): boolean {
  return (
    pathname.startsWith('/_authed') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/ehrbase')
  )
}

export function applySecurityHeaders(
  headers: Headers,
  opts: { nonce: string; pathname: string },
): void {
  const csp = buildCsp(opts.nonce)
  if (isProduction) {
    headers.set('Content-Security-Policy', csp)
  } else {
    // Shadow mode in dev/staging — report, do not block.
    headers.set('Content-Security-Policy-Report-Only', `${csp}; report-uri /api/csp-report`)
  }

  headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload',
  )
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  )
  headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
  headers.set('X-Frame-Options', 'DENY')

  if (isAuthedPath(opts.pathname)) {
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  }
}
