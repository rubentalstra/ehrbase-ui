// Sidebar brand header (repurposed from the sidebar-07 block's TeamSwitcher,
// docs/architecture.md §6). We have no multi-tenant "teams", so this is a
// static, non-interactive brand: product name + tagline + mark, linking home.
// Collapses to just the mark in the icon-rail state (handled by the sidebar
// primitive). Labels via Paraglide.

import { Link } from '@tanstack/react-router'
import { ActivityIcon } from 'lucide-react'

import { m } from '@ehrbase-ui/i18n/messages'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@ehrbase-ui/ui/components/sidebar'

export function BrandHeader() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" asChild tooltip={m.app_title()}>
          <Link to="/">
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <ActivityIcon className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{m.app_title()}</span>
              <span className="truncate text-xs text-muted-foreground">
                {m.app_brand_tagline()}
              </span>
            </div>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
