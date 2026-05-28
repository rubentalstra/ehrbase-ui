// Command palette (docs/architecture.md §6, §12.6). Opens on Cmd/Ctrl+K — the
// sidebar owns Cmd/Ctrl+B, so we don't collide. Lists the navigable routes and
// a non-actionable "Keyboard shortcuts" reference. Selecting a route navigates
// via the router. All copy via Paraglide.

import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  AccessibilityIcon,
  HomeIcon,
  ScrollTextIcon,
  SearchIcon,
  UserIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { m } from '@/paraglide/messages.js'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'

type NavTarget = '/' | '/me' | '/me/access-log' | '/accessibility'

const navItems: { to: NavTarget; label: () => string; icon: LucideIcon }[] = [
  { to: '/', label: () => m.app_title(), icon: HomeIcon },
  { to: '/me', label: () => m.nav_account(), icon: UserIcon },
  { to: '/me/access-log', label: () => m.nav_access_log(), icon: ScrollTextIcon },
  { to: '/accessibility', label: () => m.footer_accessibility(), icon: AccessibilityIcon },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  function go(to: NavTarget) {
    setOpen(false)
    void navigate({ to })
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-muted-foreground w-full justify-start gap-2 sm:w-56"
        onClick={() => setOpen(true)}
      >
        <SearchIcon className="size-4" />
        <span className="flex-1 text-left">{m.command_open()}</span>
        <kbd className="bg-secondary text-secondary-foreground pointer-events-none hidden h-5 items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium sm:inline-flex">
          ⌘K
        </kbd>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={m.command_open()}
        description={m.command_placeholder()}
      >
        <Command>
          <CommandInput placeholder={m.command_placeholder()} />
          <CommandList>
            <CommandEmpty>{m.command_empty()}</CommandEmpty>
            <CommandGroup heading={m.command_group_navigation()}>
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <CommandItem
                    key={item.to}
                    value={item.label()}
                    onSelect={() => go(item.to)}
                  >
                    <Icon />
                    <span>{item.label()}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading={m.command_group_shortcuts()}>
              <CommandItem disabled>
                <span>{m.command_shortcut_palette()}</span>
                <CommandShortcut>⌘K</CommandShortcut>
              </CommandItem>
              <CommandItem disabled>
                <span>{m.command_shortcut_sidebar()}</span>
                <CommandShortcut>⌘B</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
