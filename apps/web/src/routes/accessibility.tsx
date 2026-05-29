// Public accessibility statement (docs/architecture.md §12.8). Required for the
// EN 301 549 / WCAG 2.2 AA release gate. Deliberately public (no auth) so it is
// reachable from the footer on every page and by procurement reviewers. All
// copy via Paraglide (§11.5); typography via @tailwindcss/typography `prose`.

import { createFileRoute, Link } from '@tanstack/react-router'

import { m } from '@ehrbase-ui/i18n/messages'
import { Button } from '@/components/ui/button'

const LAST_REVIEWED = '2026-05-27'

export const Route = createFileRoute('/accessibility')({ component: AccessibilityStatement })

function AccessibilityStatement() {
  return (
    <main
      id="main-content"
      className="mx-auto max-w-2xl px-6 py-12 prose prose-neutral dark:prose-invert"
    >
      <h1>{m.a11y_title()}</h1>
      <p className="lead">{m.a11y_intro()}</p>
      <p className="text-sm text-muted-foreground not-prose">
        {m.a11y_last_reviewed({ date: LAST_REVIEWED })}
      </p>

      <h2>{m.a11y_standard_heading()}</h2>
      <p>{m.a11y_standard_body()}</p>

      <h2>{m.a11y_known_issues_heading()}</h2>
      <p>{m.a11y_known_issues_body()}</p>

      <h2>{m.a11y_contact_heading()}</h2>
      <p>{m.a11y_contact_body()}</p>

      <p className="not-prose">
        <Button asChild variant="outline">
          <Link to="/">{m.error_home()}</Link>
        </Button>
      </p>
    </main>
  )
}
