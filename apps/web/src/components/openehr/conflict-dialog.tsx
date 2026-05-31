// ConflictDialog — the 412 optimistic-concurrency conflict-resolution surface
// (docs/architecture.md §7, F4). Anchored in the compose/edit path: when an
// updateComposition returns `{ status: "conflict", currentVersionUid }`, the
// edit form opens this dialog. It fetches the CURRENT server composition (FLAT
// read via readComposition) and shows a side-by-side, field-level diff of the
// user's pending form-state (left) vs the current server form-state (right).
//
// Two resolutions:
//   (a) reload-and-discard  → drop the user's edits, reload the latest version
//   (b) retry-on-latest     → re-apply the user's pending changes onto the latest
//                             version_uid and call updateComposition again
//
// No PHI is logged or sent to traces here (the diff renders in-DOM only; the
// audit/observability layer is deferred with governance). All chrome via
// Paraglide (rule 4); shadcn Dialog + Table primitives only (rule 6).

import { useQuery } from '@tanstack/react-query'

import { m } from '@ehrbase-ui/i18n/messages'

import { readComposition } from '@/server/functions/composition.functions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export interface ConflictDialogProps {
  open: boolean
  ehrId: string
  templateId: string
  compositionUid: string
  /** The latest server version_uid (from the 412), or null when unknown. */
  currentVersionUid: string | null
  /** The user's pending (unsaved) form-state values. */
  pendingValues: Record<string, unknown>
  /** Discard the user's changes and reload the latest server version. */
  onReloadDiscard: () => void
  /**
   * Re-apply the user's pending changes onto the latest version_uid and retry
   * the update. Passed the latest version_uid to use as the new If-Match.
   */
  onRetryOnLatest: (latestVersionUid: string) => void
  /** True while the retry-on-latest update is in flight. */
  isRetrying: boolean
  onCancel: () => void
}

// One field-level diff row: a dotted path + the user value and the server value,
// each pre-stringified for display.
interface DiffRow {
  path: string
  yours: string
  theirs: string
}

// Type guard for a plain object (used to recurse into nested form-state).
function isPlainRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

// Flatten a form-state object into dotted-path → display-string entries. Leaf
// scalars stringify directly; arrays + nested objects render as compact JSON at
// their path (good enough for a human-readable conflict diff — no `as`, rule 3).
function flatten(value: unknown, prefix: string, out: Map<string, string>): void {
  if (isPlainRecord(value)) {
    const keys = Object.keys(value)
    if (keys.length === 0) {
      out.set(prefix, '{}')
      return
    }
    for (const key of keys) {
      const next = prefix ? `${prefix}.${key}` : key
      flatten(value[key], next, out)
    }
    return
  }
  out.set(prefix, displayScalar(value))
}

function displayScalar(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  // Arrays / anything else: compact JSON.
  return JSON.stringify(value)
}

// Build the sorted set of field-level differences between the two form-states.
function diffFormStates(
  yours: Record<string, unknown>,
  theirs: Record<string, unknown>,
): DiffRow[] {
  const yoursFlat = new Map<string, string>()
  const theirsFlat = new Map<string, string>()
  flatten(yours, '', yoursFlat)
  flatten(theirs, '', theirsFlat)

  const paths = new Set<string>([...yoursFlat.keys(), ...theirsFlat.keys()])
  const rows: DiffRow[] = []
  for (const path of [...paths].sort((a, b) => a.localeCompare(b))) {
    const y = yoursFlat.get(path) ?? ''
    const t = theirsFlat.get(path) ?? ''
    if (y !== t) rows.push({ path, yours: y, theirs: t })
  }
  return rows
}

export function ConflictDialog({
  open,
  ehrId,
  templateId,
  compositionUid,
  currentVersionUid,
  pendingValues,
  onReloadDiscard,
  onRetryOnLatest,
  isRetrying,
  onCancel,
}: ConflictDialogProps) {
  // Fetch the CURRENT server composition (FLAT read → form-state) for the diff.
  const currentQuery = useQuery({
    queryKey: ['conflict', 'current', ehrId, compositionUid],
    queryFn: () => readComposition({ data: { ehrId, templateId, compositionUid } }),
    enabled: open,
  })

  // The latest version_uid to retry against: prefer the freshly-read one (it is
  // the most authoritative), then the version_uid the 412 reported.
  const latestVersionUid = currentQuery.data?.versionUid ?? currentVersionUid

  let theirsValues: Record<string, unknown> = {}
  if (currentQuery.data) {
    try {
      const parsed: unknown = JSON.parse(currentQuery.data.formState)
      if (isPlainRecord(parsed)) theirsValues = parsed
    } catch {
      // Non-fatal — the diff will treat the server side as empty.
    }
  }
  const diffRows = currentQuery.data ? diffFormStates(pendingValues, theirsValues) : []

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel() }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{m.conflict_title()}</DialogTitle>
          <DialogDescription>{m.conflict_description()}</DialogDescription>
        </DialogHeader>

        <p className="text-muted-foreground text-xs">
          {latestVersionUid
            ? m.conflict_current_version({ versionUid: latestVersionUid })
            : m.conflict_no_current_version()}
        </p>

        {currentQuery.isPending ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
          </div>
        ) : currentQuery.isError ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{m.conflict_load_current_failed()}</AlertDescription>
          </Alert>
        ) : diffRows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{m.conflict_no_differences()}</p>
        ) : (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.conflict_col_field()}</TableHead>
                  <TableHead>{m.conflict_col_yours()}</TableHead>
                  <TableHead>{m.conflict_col_theirs()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diffRows.map((row) => (
                  <TableRow key={row.path}>
                    <TableCell className="font-mono text-xs align-top">{row.path}</TableCell>
                    <TableCell className="align-top text-sm">
                      {row.yours || m.conflict_value_empty()}
                    </TableCell>
                    <TableCell className="align-top text-sm">
                      {row.theirs || m.conflict_value_empty()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {m.conflict_cancel()}
          </Button>
          <Button type="button" variant="outline" onClick={onReloadDiscard}>
            {m.conflict_reload_discard()}
          </Button>
          <Button
            type="button"
            disabled={isRetrying || latestVersionUid === null}
            onClick={() => {
              if (latestVersionUid !== null) onRetryOnLatest(latestVersionUid)
            }}
          >
            {isRetrying ? m.conflict_retrying() : m.conflict_retry_on_latest()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
