import type { StorybookConfig } from '@storybook/tanstack-react'

// docs/architecture.md §17 "Storybook for the component library".
// ADR-0010 records why we ship Storybook 10. ADR-0047 records the move to the
// official `@storybook/tanstack-react` framework: it auto-wraps every story in a
// memory-backed TanStack Router, rewrites `createServerFn` handlers to
// `storybook/test` mocks (eliminating dead server imports), stubs `.server.ts`
// files, and intercepts `@tanstack/react-start` / `@tanstack/start-storage-context`
// — so the hand-written server-fn stubs + node-builtin shims are gone.
//
// Storybook's Vite builder loads the project's vite.config.ts, which collapses to
// its Storybook-safe plugin set (Tailwind + the `@` alias) when STORYBOOK=true;
// the framework strips the TanStack Start plugin on top of that. No viteFinal hook
// is needed here.

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(ts|tsx)'],
  addons: [
    '@chromatic-com/storybook',
    '@storybook/addon-a11y',
    '@storybook/addon-docs',
    '@storybook/addon-vitest',
  ],
  framework: {
    name: '@storybook/tanstack-react',
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
}

export default config
