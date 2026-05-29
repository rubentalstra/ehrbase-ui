// Standalone Paraglide compile step (docs/architecture.md §11.4, §11.7).
//
// Uses the OFFICIAL programmatic invocation documented at
//   https://inlang.com/m/gerre34r/library-inlang-paraglideJs/compiling-messages
// — one of Paraglide's three supported entry points (CLI, bundler plugin,
// programmatic). We need the programmatic form because the CLI does not
// accept --url-patterns and we want the standalone compile (used by CI and
// `pnpm test`) to emit the same runtime as the Vite plugin.
//
// IMPORTANT: keep `strategy` and `urlPatterns` here identical to the values
// in `vite.config.ts`. Adding a locale means editing BOTH files (the official
// docs show options inline in every example; there is no shared-config
// convention).

import { compile } from '@inlang/paraglide-js'

await compile({
  project: './project.inlang',
  outdir: './src/paraglide',
  strategy: ['url', 'cookie', 'preferredLanguage', 'baseLocale'],
  urlPatterns: [
    {
      pattern: '/',
      localized: [['en', '/en']],
    },
    {
      pattern: '/:path(.*)?',
      localized: [['en', '/en/:path(.*)?']],
    },
  ],
  // Exclude API routes from i18n redirection — they are not pages.
  // https://inlang.com/m/gerre34r/library-inlang-paraglideJs/i18n-routing
  routeStrategies: [{ match: '/api/:path(.*)?', exclude: true }],
})
