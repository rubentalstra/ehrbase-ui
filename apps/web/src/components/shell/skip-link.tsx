// Skip-to-content link (docs/architecture.md §12.6, WCAG 2.4.1 Bypass Blocks).
// First focusable element in the shell; visually hidden until focused (see the
// `.skip-link` rule in styles.css). Targets the <main id="main-content">.

import { m } from '@ehrbase-ui/i18n/messages'

export function SkipLink() {
  return (
    <a href="#main-content" className="skip-link">
      {m.skip_to_content()}
    </a>
  )
}
