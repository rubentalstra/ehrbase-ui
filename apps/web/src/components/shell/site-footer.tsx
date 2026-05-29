// Consistent site footer (docs/architecture.md §12, WCAG 2.2 SC 3.2.6
// Consistent Help). Rendered on every authed page in ONE fixed order so the
// help mechanism is always in the same relative location. Labels via Paraglide.
//
// Help + Contact point at the open-source project's real resources (the repo
// README / issue tracker, from package.json homepage/repository); Accessibility
// is the in-app statement page. A dedicated privacy-policy page lands with the
// M4 compliance milestone (DPA/RoPA), so it is intentionally not linked yet.

import { Link } from '@tanstack/react-router'

import { m } from '@ehrbase-ui/i18n/messages'

const HELP_URL = 'https://github.com/rubentalstra/ehrbase-ui#readme'
const CONTACT_URL = 'https://github.com/rubentalstra/ehrbase-ui/issues'

export function SiteFooter() {
  return (
    <footer
      aria-label={m.footer_label()}
      className="border-t px-4 py-3 text-sm text-muted-foreground print:hidden"
    >
      <nav>
        <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <li>
            <a className="hover:text-foreground" href={HELP_URL}>
              {m.footer_help()}
            </a>
          </li>
          <li>
            <Link className="hover:text-foreground" to="/accessibility">
              {m.footer_accessibility()}
            </Link>
          </li>
          <li>
            <a className="hover:text-foreground" href={CONTACT_URL}>
              {m.footer_contact()}
            </a>
          </li>
        </ul>
      </nav>
    </footer>
  )
}
