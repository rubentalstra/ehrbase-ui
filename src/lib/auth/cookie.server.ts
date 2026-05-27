// Session cookie name + attributes (docs/architecture.md §5.4 cookie table).
//
// httpOnly (no JS access), Secure in production, SameSite=Lax (first CSRF
// layer, §5.8), path-scoped to the whole app. The cookie carries only the
// opaque session id; all sensitive material lives server-side in Valkey.

const isProduction = process.env.NODE_ENV === 'production'

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
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  }
}
