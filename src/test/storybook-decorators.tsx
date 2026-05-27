// Shared Storybook decorators. Several shell components depend on a router
// context (TanStack <Link>, useRouterState, useNavigate). This builds a minimal
// in-memory router whose tree contains the paths the shell links to, so links
// resolve and the components render in isolation.

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import type { Decorator } from '@storybook/react-vite'

import { ThemeProvider } from '@/components/theme/theme-provider'

const STUB_PATHS = ['/', '/me', '/me/access-log', '/accessibility']

export const withRouter: Decorator = (Story) => {
  const rootRoute = createRootRoute({ component: () => <Story /> })
  const children = STUB_PATHS.map((path) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => null }),
  )
  const routeTree = rootRoute.addChildren(children)
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return <RouterProvider router={router} />
}

export const withTheme: Decorator = (Story) => (
  <ThemeProvider>
    <Story />
  </ThemeProvider>
)
