import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { m } from '@/paraglide/messages.js'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/')({
  validateSearch: z.object({ auth_error: z.coerce.number().optional() }),
  component: Home,
})

function Home() {
  const { auth_error } = Route.useSearch()

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold">{m.app_title()}</h1>
          <p className="mt-4 text-lg text-muted-foreground">{m.app_subtitle()}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {m.app_checklist_hint()}
          </p>
        </div>
        <Button asChild>
          <a href="/api/auth/login?redirect=/me">{m.nav_sign_in()}</a>
        </Button>
      </div>

      {auth_error ? (
        <Alert variant="destructive">
          <AlertDescription>{m.auth_error_notice()}</AlertDescription>
        </Alert>
      ) : null}
    </main>
  )
}
