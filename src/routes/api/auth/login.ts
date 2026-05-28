// GET /api/auth/login — redirect bridge into the Better Auth SSO flow
// (docs/architecture.md §5; ADR-0028).
//
// Better Auth's native sign-in URL is POST /api/auth/sign-in/sso; protected
// routes use this thin GET shim to initiate the flow from beforeLoad
// redirects + plain anchors (`<a href="/api/auth/login?redirect=/me">`).
// The shim calls into auth.api.signInSSO server-side and 302s the browser
// to the authorization endpoint the call returns.

import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'

import {
  auth,
  ensureKeycloakSsoProviderRegistered,
} from '@/lib/auth/auth.server'

const SsoRedirectShapeSchema = z
  .object({
    url: z.string().optional(),
    redirect: z.string().optional(),
  })
  .partial()

function safeCallback(raw: string | null): string {
  // Same allow-list shape the M2 callback used — only same-origin paths.
  return raw && /^\/(?!\/)/.test(raw) ? raw : '/me'
}

export const Route = createFileRoute('/api/auth/login')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        await ensureKeycloakSsoProviderRegistered()
        const url = new URL(request.url)
        const callbackURL = safeCallback(url.searchParams.get('redirect'))
        const providerId = process.env.SSO_KEYCLOAK_PROVIDER_ID ?? 'keycloak'

        const result = await auth.api.signInSSO({
          body: { providerId, callbackURL },
          headers: new Headers(request.headers),
          asResponse: true,
        })
        // Better Auth returns either a redirect Response (asResponse:true)
        // or a body with `{ url }`. Follow whichever it gave us.
        if (result instanceof Response) {
          if (result.status >= 300 && result.status < 400) return result
          const raw: unknown = await result
            .clone()
            .json()
            .catch(() => null)
          const parsed = SsoRedirectShapeSchema.safeParse(raw ?? {})
          const dest = parsed.success
            ? (parsed.data.url ?? parsed.data.redirect)
            : undefined
          if (dest) throw redirect({ href: dest })
          return result
        }
        // Defensive fallback — shouldn't happen with asResponse:true.
        throw redirect({ href: '/' })
      },
    },
  },
})
