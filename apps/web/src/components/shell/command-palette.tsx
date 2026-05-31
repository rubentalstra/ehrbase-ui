// Command palette (docs/architecture.md §6, §12.6; ADR-0046). Opens on Cmd/Ctrl+K
// (the sidebar owns Cmd/Ctrl+B). It is the GLOBAL PATIENT SEARCH: type a name,
// MRN, or date of birth and jump straight into a patient's context — no UUID, no
// ehrId, ever. Also lists navigable routes. All copy via Paraglide.

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { AccessibilityIcon, HomeIcon, SearchIcon, UserIcon, UsersIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { type PartySearchQuery } from '@ehrbase-ui/demographic-core'
import { m } from '@ehrbase-ui/i18n/messages'
import type { AppNavRoute } from '@/lib/router/routes'
import {
  patientAge,
  patientDisplayName,
  patientMrn,
} from '@/components/patient/patient-identity'
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
import { searchPatients, type PatientSearchResult } from '@/server/functions/patient.functions'

const navItems: { to: AppNavRoute; label: () => string; icon: LucideIcon }[] = [
  { to: '/', label: () => m.app_title(), icon: HomeIcon },
  { to: '/patients', label: () => m.nav_patients(), icon: UsersIcon },
  { to: '/me', label: () => m.nav_account(), icon: UserIcon },
  {
    to: '/accessibility',
    label: () => m.footer_accessibility(),
    icon: AccessibilityIcon,
  },
]

// Smart-parse the typed query into a structured patient search (ADR-0046):
// a date-shaped string → DOB; all digits → MRN; otherwise a family-name prefix.
function toPatientQuery(raw: string): PartySearchQuery {
  const q = raw.trim()
  const common = { limit: 8, offset: 0 }
  if (/^\d{4}(-\d{2})?(-\d{2})?$/u.test(q)) return { ...common, birthDate: q }
  if (/^\d+$/u.test(q)) return { ...common, identifier: { namespace: 'mrn', value: q } }
  return { ...common, family: q }
}

function patientLabel(p: PatientSearchResult['parties'][number]): string {
  const age = patientAge(p.birthDate)
  const dob = p.birthDate ? `${p.birthDate}${age !== null ? ` (${m.patient_banner_age({ age })})` : ''}` : ''
  const mrn = patientMrn(p)
  return [patientDisplayName(p), dob, mrn ? `MRN ${mrn}` : '']
    .filter(Boolean)
    .join(' · ')
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
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

  // Debounce so we don't query EHRbase/demographics on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200)
    return () => clearTimeout(t)
  }, [query])

  const patients = useQuery({
    queryKey: ['command', 'patients', debounced],
    queryFn: () => searchPatients({ data: toPatientQuery(debounced) }),
    enabled: open && debounced.length >= 2,
  })

  const lower = query.trim().toLowerCase()
  const nav = lower
    ? navItems.filter((i) => i.label().toLowerCase().includes(lower))
    : navItems

  function goPatient(patientId: string) {
    setOpen(false)
    setQuery('')
    void navigate({ to: '/patients/$patientId', params: { patientId } })
  }
  function go(to: AppNavRoute) {
    setOpen(false)
    setQuery('')
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
        {/* shouldFilter=false: we drive results ourselves (async patient search
            + manual nav filtering) so cmdk doesn't hide async results. */}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={m.command_patients_hint()}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>{m.command_empty()}</CommandEmpty>

            {patients.data && patients.data.parties.length > 0 ? (
              <CommandGroup heading={m.command_group_patients()}>
                {patients.data.parties.map((p) => (
                  <CommandItem key={p.id} value={p.id} onSelect={() => goPatient(p.id)}>
                    <UsersIcon />
                    <span>{patientLabel(p)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {nav.length > 0 ? (
              <CommandGroup heading={m.command_group_navigation()}>
                {nav.map((item) => {
                  const Icon = item.icon
                  return (
                    <CommandItem key={item.to} value={item.to} onSelect={() => go(item.to)}>
                      <Icon />
                      <span>{item.label()}</span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ) : null}

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
