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
          '@': fileURLToPath(new URL('../src', import.meta.url)),
        },
      },
    })
  },
}

export default config
