// /login — entry point for unauthenticated visitors (docs/architecture.md
// §5; ADR-0044). Mirrors the official Better Auth + TanStack Start
// integration: a real React page whose Sign-in button calls
// `authClient.signIn.oauth2(...)` (genericOAuth) so the browser navigates to
// Keycloak directly — no server-side GET shim.
//
// If the visitor already has a session (`?error` notwithstanding), the
// route bounces them straight to the redirect target.

import { createFileRoute, redirect, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'

import { m } from '@ehrbase-ui/i18n/messages'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { authClient } from '@/lib/auth-client'
import { getSession } from '@/lib/auth/auth.functions'

const LoginSearchSchema = z.object({
  redirect: z.string().optional(),
})

export const Route = createFileRoute('/login')({
  validateSearch: LoginSearchSchema,
  beforeLoad: async ({ search }) => {
    const session = await getSession()
    if (session) throw redirect({ href: search.redirect ?? '/me' })
  },
  component: Login,
})

function safeCallback(raw: string | undefined): string {
  // Same-origin paths only — defend against open-redirect.
  return raw && /^\/(?!\/)/.test(raw) ? raw : '/me'
}

function Login() {
  const search = useSearch({ from: '/login' })
  const callbackURL = safeCallback(search.redirect)
  const [pending, setPending] = useState(false)

  async function start() {
    setPending(true)
    await authClient.signIn.oauth2({
      providerId: 'keycloak',
      callbackURL,
    })
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-sm items-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{m.nav_sign_in()}</CardTitle>
          <CardDescription>{m.app_subtitle()}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={start} disabled={pending} className="w-full">
            {m.nav_sign_in()}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
