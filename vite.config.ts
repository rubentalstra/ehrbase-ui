import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { devtools } from '@tanstack/devtools-vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    devtools(),
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
      // Strict mode is on by default; missing keys in any registered locale
      // file fail the build (docs/architecture.md §11.7).
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
