// Workbench layout (Part C Phase 1 — engine-first workbench). A developer-facing
// surface to drive EHRbase end to end: browse/upload templates, create/inspect
// EHRs, and run AQL. This is the functional workbench, NOT the polished clinical
// UI. Renders a sub-nav (router Links styled as tabs) across the three sub-routes
// and an <Outlet> for the active one. All copy via Paraglide (rule 4).

import { createFileRoute, Link, Outlet, useRouterState } from '@tanstack/react-router'

import { m } from '@ehrbase-ui/i18n/messages'
import { FeatureErrorBoundary } from '@/components/errors/feature-error-boundary'
import type { AppNavRoute } from '@/lib/router/routes'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_authed/workbench')({
  component: WorkbenchLayout,
  errorComponent: FeatureErrorBoundary,
})

type SubNavItem = { to: AppNavRoute; label: string }

function WorkbenchLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const items: SubNavItem[] = [
    { to: '/workbench/templates', label: m.workbench_tab_templates() },
    { to: '/workbench/ehr', label: m.workbench_tab_ehr() },
    { to: '/workbench/aql', label: m.workbench_tab_aql() },
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold">{m.workbench_title()}</h1>
        <p className="text-muted-foreground">{m.workbench_subtitle()}</p>
      </div>

      <nav aria-label={m.workbench_title()} className="border-b">
        <ul className="flex gap-1">
          {items.map((item) => {
            const active = pathname.startsWith(item.to)
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-9 items-center border-b-2 px-3 text-sm font-medium transition-colors',
                    active
                      ? 'border-primary text-foreground'
                      : 'text-muted-foreground hover:text-foreground border-transparent',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <Outlet />
    </div>
  )
}
