// Single source of truth for app-route literals (docs/architecture.md §16).
//
// `routeTree.gen.ts` is TanStack Router's auto-generated map of every file
// route; its `FileRouteTypes['to']` union is the authoritative list of
// navigable paths. We narrow to the user-facing page surfaces here so
// navigation components (sidebar, command palette, breadcrumbs) share one
// type rather than each hand-listing the literals — adding a page only
// updates the route tree, and every consumer picks up the new value with
// zero hand-edits.

import type { FileRouteTypes } from '@/routeTree.gen'

// Every `/api/*` route is an HTTP handler, not a page — strip it from the
// nav surface.
export type AppNavRoute = Exclude<FileRouteTypes['to'], `/api/${string}`>
