import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { devtools } from '@tanstack/devtools-vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'

// Storybook runs its own Vite build with a different preview shell that
// can't host the TanStack Start / Nitro / Paraglide plugins. Detect the
// Storybook context and emit a stripped plugin chain when it loads this
// file. See .storybook/main.ts viteFinal hook.
const isStorybook =
  process.env.STORYBOOK === 'true' ||
  process.argv.some((a) => a.includes('storybook'))

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: isStorybook
    ? [tailwindcss(), viteReact()]
    : [
        devtools(),
        nitro({
          rollupConfig: { external: [/^@sentry\//] },
          // M4 audit-governance tasks (ADR-0026). The cron expressions are
          // overridable via env so deployments can shift the windows; the
          // task names match the file-based naming (tasks/audit/<name>.ts).
          // Nitro tasks are still experimental and require the opt-in flag.
          experimental: { tasks: true },
          scheduledTasks: {
            [process.env.AUDIT_INTEGRITY_CRON ?? '0 3 * * *']: [
              'audit:integrity',
            ],
            [process.env.AUDIT_PURGE_CRON ?? '0 4 * * *']: ['audit:purge'],
          },
        }),
        paraglideVitePlugin({
          // Configuration follows the official Paraglide TanStack Start
          // example: https://github.com/opral/paraglide-js/tree/main/examples/tanstack-start
          //
          // Per ADR-0030 the inlang project + locale message files + the
          // compiled output live in packages/i18n/. Paths here are relative
          // to apps/web/vite.config.ts.
          project: '../../packages/i18n/project.inlang',
          outdir: '../../packages/i18n/src/paraglide',
          // Symmetric URL-prefix routing — every locale lives under its own
          // /{locale}/... path, INCLUDING the base locale. (docs/architecture.md
          // §11.4.) The first urlPattern handles the bare `/` so a hit to root
          // redirects into /en (or the resolved preferred locale); the second
          // handles every other path.
          //
          // Adding a locale (e.g. `nl`, `de`, `fr`) — the recipe is:
          //   1. Add the locale code to packages/i18n/project.inlang/settings.json `locales`.
          //   2. Add packages/i18n/messages/<locale>.json with every key from en.json.
          //   3. Add a row to BOTH urlPattern entries below:
          //        ['nl', '/nl']               (first pattern)
          //        ['nl', '/nl/:path(.*)?']    (second pattern)
          //   4. Mirror the same urlPattern additions in
          //      packages/i18n/scripts/paraglide-compile.mjs (single source of
          //      truth — kept in sync because the Paraglide CLI cannot pass
          //      urlPatterns, and CI needs the same runtime as the Vite build).
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
          // API routes (auth, BFF proxy, telemetry sinks) are NOT pages and
          // must never be locale-redirected. Documented exclusion pattern:
          //   https://inlang.com/m/gerre34r/library-inlang-paraglideJs/i18n-routing
          routeStrategies: [{ match: '/api/:path(.*)?', exclude: true }],
          // Strict mode is on by default — missing keys in any registered
          // locale file fail the build (docs/architecture.md §11.7).
        }),
        tailwindcss(),
        tanstackStart(),
        viteReact(),
      ],
  build: {
    // Hidden source maps: generated for incident-response use, but no
    // sourceMappingURL comment is emitted into the production bundle so the
    // browser cannot fetch them. See docs/architecture.md §5.11.
    sourcemap: 'hidden',
  },
})
