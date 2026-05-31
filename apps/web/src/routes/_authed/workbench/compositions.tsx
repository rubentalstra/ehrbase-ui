// Workbench › Compositions (P1.4 — composition-list workbench surface).
//
// Anchored in: docs/architecture.md §7 (form pipeline, read path).
//
// Accepts an EHR ID → executes the AQL composition-list query via executeAql
// → renders a Table of uid / name / templateId rows → clicking "View" opens
// the CompositionViewer (Dialog) for that composition.
//
// Data flow:
//   executeAql (query.functions.ts, P1.1) → AQL result
//   readComposition + getWebTemplate → CompositionViewer (Dialog)
//
// All chrome strings via Paraglide (rule 4).
// shadcn primitives only (rule 6).
// No PHI here — workbench only; template node names are data.

import { useCallback, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import { z } from 'zod'

import { m } from '@ehrbase-ui/i18n/messages'
import { FeatureErrorBoundary } from '@/components/errors/feature-error-boundary'
import { executeAql, type JsonValue } from '@/server/functions/query.functions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable } from '@/components/ui/data-table'
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CompositionViewer } from '@/components/openehr/composition-viewer'

export const Route = createFileRoute('/_authed/workbench/compositions')({
  component: CompositionsWorkbench,
  errorComponent: FeatureErrorBoundary,
})

// AQL that lists all compositions in an EHR with their uid, name, and template id.
// $ehrId is substituted by EHRbase server-side.
const COMPOSITION_LIST_AQL =
  'SELECT c/uid/value AS uid, c/name/value AS name, c/archetype_details/template_id/value AS templateId FROM EHR e[ehr_id/value=$ehrId] CONTAINS COMPOSITION c ORDER BY c/context/start_time/value DESC'

const UuidSchema = z.uuid()

// Row shape derived from the AQL result.
interface CompositionRow {
  uid: string
  name: string
  templateId: string
}

// Extract a string cell from a JsonValue cell, returning '' for null/non-string.
function cellString(value: JsonValue): string {
  if (typeof value === 'string') return value
  return ''
}

// Parse an AQL result row into a CompositionRow.
function parseRow(row: JsonValue[]): CompositionRow | null {
  const uid = cellString(row[0] ?? null)
  const name = cellString(row[1] ?? null)
  const templateId = cellString(row[2] ?? null)
  if (!uid) return null
  return { uid, name, templateId }
}

// Columns for the composition list. Sortable data columns + a right-aligned
// non-sortable action column that opens the CompositionViewer dialog.
function compositionColumns(
  onView: (row: CompositionRow) => void,
): ColumnDef<CompositionRow, unknown>[] {
  return [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={m.compositions_col_name()} />
      ),
      cell: ({ row }) => <>{row.original.name || m.compositions_col_name()}</>,
    },
    {
      accessorKey: 'templateId',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={m.compositions_col_template()} />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.templateId}</span>
      ),
    },
    {
      accessorKey: 'uid',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={m.compositions_col_uid()} />
      ),
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.uid}</span>,
    },
    {
      id: 'actions',
      enableSorting: false,
      header: () => m.compositions_col_actions(),
      cell: ({ row }) => (
        <div className="text-right">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onView(row.original)}
          >
            {m.compositions_view()}
          </Button>
        </div>
      ),
    },
  ]
}

function CompositionsWorkbench() {
  const [ehrIdInput, setEhrIdInput] = useState('')
  const [activeEhrId, setActiveEhrId] = useState<string | null>(null)

  // Viewer dialog state.
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerCompositionUid, setViewerCompositionUid] = useState<string | null>(null)
  const [viewerTemplateId, setViewerTemplateId] = useState<string | null>(null)

  const validEhrId = UuidSchema.safeParse(ehrIdInput.trim()).success

  const listMutation = useMutation({
    mutationFn: (ehrId: string) =>
      executeAql({
        data: {
          q: COMPOSITION_LIST_AQL,
          queryParameters: { ehrId },
        },
      }),
  })

  function handleLoad() {
    if (!validEhrId) return
    const id = ehrIdInput.trim()
    setActiveEhrId(id)
    listMutation.mutate(id)
  }

  const openViewer = useCallback((row: CompositionRow) => {
    setViewerCompositionUid(row.uid)
    setViewerTemplateId(row.templateId)
    setViewerOpen(true)
  }, [])

  function closeViewer() {
    setViewerOpen(false)
    setViewerCompositionUid(null)
    setViewerTemplateId(null)
  }

  const columns = useMemo(() => compositionColumns(openViewer), [openViewer])

  const rows: CompositionRow[] = (listMutation.data?.rows ?? [])
    .map(parseRow)
    .filter((r): r is CompositionRow => r !== null)

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{m.compositions_title()}</h2>
        <p className="text-muted-foreground text-sm">{m.compositions_subtitle()}</p>
      </div>

      {/* EHR ID input */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-1">
            <Label htmlFor="compositions-ehr-id">{m.compositions_ehr_id_label()}</Label>
            <Input
              id="compositions-ehr-id"
              value={ehrIdInput}
              onChange={(e) => setEhrIdInput(e.target.value)}
              placeholder={m.compositions_ehr_id_placeholder()}
              className="font-mono"
            />
          </div>
          <Button
            type="button"
            disabled={!validEhrId || listMutation.isPending}
            onClick={handleLoad}
          >
            {listMutation.isPending ? m.compositions_loading() : m.compositions_load()}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle>{m.compositions_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          {listMutation.isError ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{m.compositions_load_failed()}</AlertDescription>
            </Alert>
          ) : activeEhrId === null ? (
            <p className="text-muted-foreground text-sm">{m.compositions_no_ehr()}</p>
          ) : listMutation.isSuccess && rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">{m.compositions_empty()}</p>
          ) : rows.length > 0 ? (
            <DataTable
              columns={columns}
              data={rows}
              caption={m.compositions_title()}
              getRowId={(r) => r.uid}
            />
          ) : null}
        </CardContent>
      </Card>

      {/* CompositionViewer Dialog */}
      <Dialog open={viewerOpen} onOpenChange={(open) => { if (!open) closeViewer() }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{m.viewer_title()}</DialogTitle>
          </DialogHeader>
          {viewerOpen && viewerCompositionUid && viewerTemplateId && activeEhrId && (
            <CompositionViewer
              ehrId={activeEhrId}
              templateId={viewerTemplateId}
              compositionUid={viewerCompositionUid}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
