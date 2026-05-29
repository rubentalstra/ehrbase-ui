// Protected layout + clinical workspace shell (docs/architecture.md §5.5, §6,
// §12). Follows the official Better Auth + TanStack Start pattern
// (https://better-auth.com/docs/integrations/tanstack — _protected.tsx
// recipe): beforeLoad calls getSession; if no session, redirect to /login
// with the current path so the SSO flow can bounce back. The session.user
// is placed on the route context for children + the shell.
//
// It also reads the sidebar_state cookie server-side (§3G) so the sidebar
// renders open/closed without a hydration flash. The cookie read is guarded
// to the server via createServerFn.
//
// Layout: a SidebarProvider row of [AppSidebar | content column]. The content
// column is a plain flex container — NOT SidebarInset, which renders its own
// <main> and would nest landmarks — so we get clean banner/main/contentinfo:
// a sticky header (sidebar trigger + breadcrumb + command palette + theme
// toggle), the <main id="main-content"> outlet, and the SiteFooter.

import {
  createFileRoute,
  Outlet,
  redirect,
  useRouterState,
} from '@tanstack/react-router'
import { getSessionWithRoles } from '@/lib/auth/auth.functions'
import { getSidebarState } from '@/lib/shell/sidebar-state'
import { m } from '@ehrbase-ui/i18n/messages'
import { AppSidebar } from '@/components/app-sidebar'
import { CommandPalette } from '@/components/shell/command-palette'
import { SiteFooter } from '@/components/shell/site-footer'
import { SkipLink } from '@/components/shell/skip-link'
import { ModeToggle } from '@/components/theme/mode-toggle'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@ehrbase-ui/ui/components/breadcrumb'
import { Separator } from '@ehrbase-ui/ui/components/separator'
import { SidebarProvider, SidebarTrigger } from '@ehrbase-ui/ui/components/sidebar'

export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ location }) => {
    const result = await getSessionWithRoles()
    if (!result) {
      throw redirect({
        href: `/login?redirect=${encodeURIComponent(location.href)}`,
      })
    }
    // Only needed for the initial SSR render (the layout persists across
    // client navigations, so the live SidebarProvider state is authoritative
    // there). On the server getSidebarState runs inline — no extra RPC.
    const sidebarOpen =
      typeof document === 'undefined'
        ? (await getSidebarState()).sidebarOpen
        : true
    const user = {
      id: result.session.user.id,
      name: result.session.user.name ?? '',
      email: result.session.user.email ?? '',
      roles: result.keycloakRoles,
    }
    return { user, sidebarOpen }
  },
  component: AuthedLayout,
})

function currentPageLabel(pathname: string): string {
  if (pathname.startsWith('/me/access-log')) return m.nav_access_log()
  if (pathname.startsWith('/me')) return m.nav_account()
  return m.app_title()
}

function AuthedLayout() {
  const { user, sidebarOpen } = Route.useRouteContext()
  const pageLabel = useRouterState({
    select: (s) => currentPageLabel(s.location.pathname),
  })

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <SkipLink />
      <AppSidebar user={user} />
      <div className="relative flex min-h-svh w-full flex-1 flex-col">
        <header className="bg-background sticky top-0 z-10 flex h-(--header-height) shrink-0 items-center gap-2 border-b px-4 print:hidden">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>{pageLabel}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex items-center gap-2">
            <CommandPalette />
            <ModeToggle />
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 p-4 outline-none md:p-6"
        >
          <Outlet />
        </main>
        <SiteFooter />
      </div>
    </SidebarProvider>
  )
}
