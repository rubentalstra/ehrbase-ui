// App theme provider (docs/architecture.md §9). Thin wrapper over next-themes
// so the rest of the app imports from one place and the configuration lives in
// a single spot. next-themes injects a tiny pre-hydration inline script that
// sets the `class` on <html> before first paint — the no-flash mechanism. That
// script is nonce-tagged via the `nonce` prop (passed from RootDocument) so it
// satisfies our strict script-src CSP (§5.7).
//
// ADR-0014 records the choice of next-themes over the hand-rolled §9 sketch:
// sonner's Toaster already depends on its useTheme(), and it ships the nonce
// prop we need.

import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes'

const STORAGE_KEY = 'ehrbase-ui-theme'

export function ThemeProvider({
  children,
  nonce,
}: {
  children: React.ReactNode
  nonce?: string
}) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey={STORAGE_KEY}
      disableTransitionOnChange
      nonce={nonce}
    >
      {children}
    </NextThemesProvider>
  )
}

export { useTheme }
