// Sidebar-footer user menu (adapted from the sidebar-07 block, docs/architecture.md
// §6). Wired to the session user from the route context — name, email, roles,
// initials avatar. Menu: My account, Access log, a disabled language switcher
// placeholder (English today; Dutch lands with the translation task, §11.6),
// and Log out. Log out is a plain anchor to the server logout route (a full
// navigation that clears the session cookie), not a router Link.

import {
  ChevronsUpDownIcon,
  GlobeIcon,
  LogOutIcon,
  ScrollTextIcon,
  UserIcon,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { m } from '@/paraglide/messages.js'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

export type NavUserData = {
  name: string
  email: string
  roles: string[]
}

function initialsOf(user: NavUserData): string {
  const source = (user.name || user.email || '?').trim()
  const parts = source.split(/\s+/).filter(Boolean)
  const first = parts.at(0) ?? source
  const last = parts.at(-1) ?? ''
  const letters =
    parts.length > 1 ? `${first.charAt(0)}${last.charAt(0)}` : source.slice(0, 2)
  return letters.toUpperCase()
}

export function NavUser({ user }: { user: NavUserData }) {
  const { isMobile } = useSidebar()
  const initials = initialsOf(user)
  const displayName = user.name || user.email

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{displayName}</span>
                <span className="truncate text-xs">{user.email}</span>
              </div>
              <ChevronsUpDownIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-56"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user.roles.length > 0 ? user.roles.join(', ') : m.me_no_roles()}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link to="/me">
                  <UserIcon />
                  {m.nav_account()}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/me/access-log">
                  <ScrollTextIcon />
                  {m.nav_access_log()}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <GlobeIcon />
              {`${m.language_label()}: ${m.language_english()}`}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href="/api/auth/logout">
                <LogOutIcon />
                {m.nav_sign_out()}
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
