import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-4xl font-bold">ehrbase-ui</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        The missing open-source UI for EHRbase. Foundation milestone in
        progress &mdash; see <code className="font-mono">docs/IMPLEMENTATION_CHECKLIST.md</code>.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Strings on this page are placeholder English and will be replaced by
        Paraglide message functions in step&nbsp;1G of the foundation milestone.
      </p>
    </main>
  )
}
