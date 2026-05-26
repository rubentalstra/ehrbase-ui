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
        nitro({ rollupConfig: { external: [/^@sentry\//] } }),
        paraglideVitePlugin({
          project: './project.inlang',
          outdir: './src/paraglide',
          // Strict mode is on by default; missing keys in any registered
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
