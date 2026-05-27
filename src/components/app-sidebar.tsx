// Application sidebar (adapted from the shadcn sidebar-07 block,
// docs/architecture.md §6). Collapses to an icon rail. Header = brand,
// content = sectioned clinical nav, footer = the session user menu.
//
// Nav is built from the session roles passed in: the Administration section is
// gated to the `admin` role. Clinical destinations (Patients, AQL, Templates)
// are present but disabled — they arrive in M5/M6, and we show the IA now
// rather than link to routes that don't exist yet (see NavMain).

import {
  FileTextIcon,
  SearchIcon,
  ScrollTextIcon,
  ShieldIcon,
  UserIcon,
  UsersIcon,
} from 'lucide-react'

import { m } from '@/paraglide/messages.js'
import { BrandHeader } from '@/components/team-switcher'
import { NavMain, type NavSection } from '@/components/nav-main'
import { NavUser, type NavUserData } from '@/components/nav-user'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'

function navSections(roles: string[]): NavSection[] {
  const sections: NavSection[] = [
    {
      label: m.nav_section_workspace(),
      items: [
        { label: m.nav_account(), icon: UserIcon, to: '/me' },
        { label: m.nav_access_log(), icon: ScrollTextIcon, to: '/me/access-log' },
      ],
    },
    {
      label: m.nav_section_clinical(),
      items: [
        { label: m.nav_patients(), icon: UsersIcon, disabled: true },
        { label: m.nav_aql(), icon: SearchIcon, disabled: true },
        { label: m.nav_templates(), icon: FileTextIcon, disabled: true },
      ],
    },
  ]

  if (roles.includes('admin')) {
    sections.push({
      label: m.nav_section_administration(),
      items: [{ label: m.nav_admin(), icon: ShieldIcon, disabled: true }],
    })
  }

  return sections
}

export function AppSidebar({
  user,
  ...props
}: { user: NavUserData } & React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <BrandHeader />
      </SidebarHeader>
      <SidebarContent>
        <NavMain sections={navSections(user.roles)} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
