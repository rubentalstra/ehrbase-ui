import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  useRouter,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'

import appCss from '../styles.css?url'
import { getLocale } from '@/paraglide/runtime.js'
import { ThemeProvider } from '@/components/theme/theme-provider'
import { RootError } from '@/components/errors/root-error'
import { NotFound } from '@/components/errors/not-found'
import { Toaster } from '@/components/ui/sonner'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'ehrbase-ui',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  errorComponent: RootError,
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  // Defined server-side (router.tsx → ssr.nonce); undefined on the client,
  // where the no-flash script is already in the SSR'd document. Feeding it to
  // next-themes nonce-tags the inline theme script so it passes our strict
  // script-src CSP (§5.7).
  const nonce = useRouter().options.ssr?.nonce
  const queryClient = useQueryClient()

  return (
    <html lang={getLocale()}>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider nonce={nonce}>
          {children}
          <Toaster />
        </ThemeProvider>
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
            {
              name: 'Tanstack Query',
              render: <ReactQueryDevtoolsPanel client={queryClient} />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
