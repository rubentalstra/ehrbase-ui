// Theme switcher (docs/architecture.md §9, §12). An icon button (36px square,
// comfortably over the WCAG 2.2 SC 2.5.8 24px minimum) opening a menu of
// Light / Dark / System. All labels are Paraglide messages (§11.5).

import { MoonIcon, SunIcon } from 'lucide-react'

import { useTheme } from '@/components/theme/theme-provider'
import { m } from '@/paraglide/messages.js'
import { Button } from '@ehrbase-ui/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ehrbase-ui/ui/components/dropdown-menu'

export function ModeToggle() {
  const { setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={m.theme_toggle()}>
          <SunIcon className="size-5 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <MoonIcon className="absolute size-5 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}>
          {m.theme_light()}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          {m.theme_dark()}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          {m.theme_system()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
