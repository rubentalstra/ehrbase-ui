// Root notFoundComponent (docs/architecture.md §10). Generic translated 404 —
// no record existence is ever leaked (§10 conflates 404/403 for sensitive
// resources; this is the plain "no such page" case for unknown URLs).

import { Link } from '@tanstack/react-router'

import { m } from '@/paraglide/messages.js'
import { Button } from '@/components/ui/button'

export function NotFound() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-start justify-center gap-4 p-8">
      <h1 className="text-2xl font-bold">{m.not_found_title()}</h1>
      <p className="text-muted-foreground">{m.not_found_body()}</p>
      <Button asChild>
        <Link to="/">{m.error_home()}</Link>
      </Button>
    </main>
  )
}
