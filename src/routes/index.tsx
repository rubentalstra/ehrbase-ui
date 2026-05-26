import { createFileRoute } from '@tanstack/react-router'
import { m } from '@/paraglide/messages.js'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-4xl font-bold">{m.app_title()}</h1>
      <p className="mt-4 text-lg text-muted-foreground">{m.app_subtitle()}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        {m.app_checklist_hint()}
      </p>
    </main>
  )
}
