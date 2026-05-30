// Application sidebar (adapted from the shadcn sidebar-07 block,
// docs/architecture.md §6). Collapses to an icon rail. Header = brand,
// content = sectioned clinical nav, footer = the session user menu.
//
// Nav is built from the session roles passed in: the Administration section is
// gated to the `admin` role. Clinical destinations (Patients, AQL, Templates)
// are present but disabled — they arrive in M5/M6, and we show the IA now
// rather than link to routes that don't exist yet (see NavMain).

import {
  DatabaseIcon,
  FileTextIcon,
  SearchIcon,
  ShieldIcon,
  TerminalIcon,
  UserIcon,
  UsersIcon,
} from 'lucide-react'

import { m } from '@ehrbase-ui/i18n/messages'
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
      items: [{ label: m.nav_account(), icon: UserIcon, to: '/me' }],
    },
    {
      label: m.nav_section_workbench(),
      items: [
        {
          label: m.nav_workbench_templates(),
          icon: FileTextIcon,
          to: '/workbench/templates',
        },
        { label: m.nav_workbench_ehr(), icon: DatabaseIcon, to: '/workbench/ehr' },
        { label: m.nav_workbench_aql(), icon: TerminalIcon, to: '/workbench/aql' },
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
  // role="navigation" + aria-label makes the sidebar a NAV landmark so its
  // brand, sections, and user menu are "contained by landmarks" (axe `region`
  // rule). Sidebar spreads {...props} onto the visible sidebar-container div.
  // The jsx-a11y-x/prefer-tag-over-role rule prefers <nav>, but the vendored
  // Sidebar primitive renders a <div>; modifying ui/** is out of scope, and
  // role="navigation" is semantically equivalent for assistive tech.
  return (
    // eslint-disable-next-line jsx-a11y-x/prefer-tag-over-role
    <Sidebar
      collapsible="icon"
      role="navigation"
      aria-label={m.app_brand_tagline()}
      {...props}
    >
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
