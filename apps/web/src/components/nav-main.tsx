// Primary sidebar navigation (adapted from the shadcn sidebar-07 block,
// docs/architecture.md §6). Section groups with router-Link items. Items
// without a `to` are future destinations (M5/M6) rendered disabled so the
// clinical information architecture is visible without linking to a 404.
// Active state is derived from the current location. All labels via Paraglide.

import { Link, useRouterState } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'

import { m } from '@/paraglide/messages.js'
import type { AppNavRoute } from '@/lib/router/routes'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@ehrbase-ui/ui/components/sidebar'

export type NavItem = {
  label: string
  icon: LucideIcon
  to?: AppNavRoute
  disabled?: boolean
}

export type NavSection = {
  label: string
  items: NavItem[]
}

export function NavMain({ sections }: { sections: NavSection[] }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <>
      {sections.map((section) => (
        <SidebarGroup key={section.label}>
          <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
          <SidebarMenu>
            {section.items.map((item) => {
              const Icon = item.icon
              if (item.to) {
                return (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.label}
                      isActive={pathname === item.to}
                    >
                      <Link to={item.to}>
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              }
              return (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton
                    disabled
                    tooltip={`${item.label} — ${m.nav_coming_soon()}`}
                  >
                    <Icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  )
}
