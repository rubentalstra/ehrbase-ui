// Session cookie name + attributes (docs/architecture.md §5.4 cookie table).
//
// httpOnly (no JS access), Secure in production, SameSite=Lax (first CSRF
// layer, §5.8), path-scoped to the whole app. The cookie carries only the
// opaque session id; all sensitive material lives server-side in Valkey.

const isProduction = process.env.NODE_ENV === 'production'

// DEV-ONLY escape hatch. The compose dev stack serves the UI over plain HTTP
// (http://localhost:3000), where the browser drops a Secure cookie — so a
// production-mode container can't hold a session over http. Setting
// SESSION_COOKIE_INSECURE=true relaxes the Secure flag for local dev ONLY.
// NEVER set it in a real deployment, which must serve HTTPS.
const allowInsecureCookie = process.env.SESSION_COOKIE_INSECURE === 'true'

if (allowInsecureCookie && isProduction) {
  // Loud breadcrumb in the logs so this can never hide in a real prod.
  console.warn(
    '[security] SESSION_COOKIE_INSECURE=true — session cookie Secure flag is ' +
      'DISABLED. This is for local HTTP dev only; never use it in production.',
  )
}

export const SESSION_COOKIE = 'ehrbase_sid'

type SessionCookieOptions = {
  httpOnly: boolean
  secure: boolean
  sameSite: 'lax'
  path: string
}

export function sessionCookieOptions(): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: isProduction && !allowInsecureCookie,
    sameSite: 'lax',
    path: '/',
  }
}
