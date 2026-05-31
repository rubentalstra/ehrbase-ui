import type { StorybookConfig } from '@storybook/react-vite'
import { fileURLToPath, URL } from 'node:url'
import { mergeConfig } from 'vite'

// docs/architecture.md §17 "Storybook for the component library".
// ADR-0010 records why we ship Storybook 10 instead of the doc-named 9.x.

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(ts|tsx)'],
  addons: [
    '@chromatic-com/storybook',
    '@storybook/addon-a11y',
    '@storybook/addon-docs',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  staticDirs: ['../public'],
  typescript: {
    check: false,
    reactDocgen: 'react-docgen-typescript',
  },
  core: {
    disableTelemetry: true,
  },
  // Storybook auto-resolves the project's vite.config.ts. We don't want
  // TanStack Start / Nitro / Paraglide plugins running inside the
  // Storybook preview shell (different bundling assumptions) — so we
  // merge in just the alias + Tailwind. Plugins from vite.config.ts are
  // explicitly ignored by setting configFile: false earlier in the chain.
  viteFinal: async (cfg) => {
    const { default: tailwindcss } = await import('@tailwindcss/vite')
    return mergeConfig(cfg, {
      configFile: false,
      plugins: [tailwindcss()],
      resolve: {
        alias: {
          // Storybook runs WITHOUT the TanStack Start plugin (above) that
          // rewrites `createServerFn` to a client fetch stub. A storied
          // component that statically imports a server function (FieldRenderer →
          // terminology.functions) would therefore drag the whole server-only
          // graph (Drizzle/postgres, ioredis, @noble crypto,
          // @tanstack/start-storage-context → node:async_hooks) into the browser
          // bundle and break the preview build. Alias the server-fn module to a
          // client stub — mirrors the real post-transform client shape. Must
          // precede the '@' alias so this exact specifier matches first.
          '@/server/functions/terminology.functions': fileURLToPath(
            new URL('./terminology-functions-stub.ts', import.meta.url),
          ),
          // createServerFn's client runtime (@tanstack/start-client-core →
          // @tanstack/start-storage-context) imports node:async_hooks, and a
          // DB-backed server function drags in `postgres` (→ perf_hooks). Vite
          // externalises node: builtins to export-less browser stubs, so those
          // NAMED imports are hard Rollup errors — shim the two that leak.
          'node:async_hooks': fileURLToPath(
            new URL('./async-hooks-stub.ts', import.meta.url),
          ),
          async_hooks: fileURLToPath(
            new URL('./async-hooks-stub.ts', import.meta.url),
          ),
          'node:perf_hooks': fileURLToPath(
            new URL('./perf-hooks-stub.ts', import.meta.url),
          ),
          perf_hooks: fileURLToPath(new URL('./perf-hooks-stub.ts', import.meta.url)),
          '@': fileURLToPath(new URL('../src', import.meta.url)),
        },
      },
    })
  },
}

export default config
