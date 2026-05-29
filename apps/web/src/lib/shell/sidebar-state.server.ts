// Sidebar open/closed state from the persisted cookie (docs/architecture.md
// §3G / §6). Server-only: reads the `sidebar_state` cookie the vendored sidebar
// primitive writes client-side on toggle. Used to set SidebarProvider's
// defaultOpen during SSR so the sidebar renders in the right state with no
// hydration flash. Absent cookie → open (matches the primitive's default).

import { getCookie } from '@tanstack/react-start/server'

export function readSidebarOpen(): boolean {
  return getCookie('sidebar_state') !== 'false'
}
