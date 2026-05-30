// Workbench › AQL (Part C Phase 1). Run an ad-hoc AQL query against EHRbase and
// render the RESULT_SET as a table — scalar cells as text, object/array cells as
// compact JSON. Wires to the executeAql server fn. All copy via Paraglide (rule
// 4); shadcn primitives only (rule 6). Note: AQL CAN reach PHI, but this is the
// engine-first workbench — the audit/observability layer was deliberately
// removed for Phase 1 (per task scope).

import { useMutation } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { m } from '@ehrbase-ui/i18n/messages'
import { FeatureErrorBoundary } from '@/components/errors/feature-error-boundary'
import {
  executeAql,
  type ExecuteAqlResult,
  type JsonValue,
} from '@/server/functions/query.functions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

export const Route = createFileRoute('/_authed/workbench/aql')({
  component: AqlWorkbench,
  errorComponent: FeatureErrorBoundary,
})

const STARTER_QUERY = 'SELECT e/ehr_id/value FROM EHR e LIMIT 25'

function AqlWorkbench() {
  const [query, setQuery] = useState(STARTER_QUERY)

  const run = useMutation({
    mutationFn: (q: string) => executeAql({ data: { q } }),
    onError: () => {
      toast.error(m.workbench_aql_failed())
    },
  })

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{m.workbench_aql_title()}</h2>
        <p className="text-muted-foreground text-sm">{m.workbench_aql_subtitle()}</p>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <Label htmlFor="aql-input">{m.workbench_aql_query_label()}</Label>
          <Textarea
            id="aql-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            rows={5}
            className="font-mono text-sm"
          />
          <Button
            type="button"
            disabled={query.trim().length === 0 || run.isPending}
            onClick={() => run.mutate(query)}
          >
            {run.isPending ? m.workbench_aql_running() : m.workbench_aql_run()}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{m.workbench_aql_results_heading()}</CardTitle>
        </CardHeader>
        <CardContent>
          {run.isError ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{m.workbench_aql_failed()}</AlertDescription>
            </Alert>
          ) : run.data ? (
            <AqlResults result={run.data} />
          ) : (
            <p className="text-muted-foreground text-sm">
              {m.workbench_aql_no_results_yet()}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// Build a stable, unique key + display label per column from its name|path,
// de-duplicating repeated headers so the JSX key never has to reference the
// array index. AQL columns ARE positionally ordered, but the header text is the
// natural identity for React reconciliation.
function columnKeys(columns: ExecuteAqlResult['columns']): { key: string; label: string }[] {
  const seen = new Map<string, number>()
  return columns.map((col, i) => {
    const label = col.name ?? col.path ?? m.workbench_aql_col_fallback({ index: i })
    const count = seen.get(label) ?? 0
    seen.set(label, count + 1)
    return { key: count === 0 ? label : `${label} (${count})`, label }
  })
}

function AqlResults({ result }: { result: ExecuteAqlResult }) {
  if (result.rows.length === 0) {
    return <p className="text-muted-foreground text-sm">{m.workbench_aql_empty()}</p>
  }

  const columns = columnKeys(result.columns)

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {m.workbench_aql_row_count({ count: result.rows.length })}
      </p>
      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key}>{col.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.map((row, ri) => (
              // A RESULT_SET is an ordered grid with no per-row identity, so the
              // row/cell position IS the key. Same justified use as app-sidebar.
              // eslint-disable-next-line @eslint-react/no-array-index-key
              <TableRow key={ri}>
                {row.map((cell, ci) => (
                  // eslint-disable-next-line @eslint-react/no-array-index-key
                  <TableCell key={ci} className="align-top font-mono text-xs">
                    {renderCell(cell)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// Scalar cells render as plain text; objects/arrays render as compact JSON. No
// `as` casts (rule 3) — narrow with typeof / Array.isArray instead.
function renderCell(cell: JsonValue): string {
  if (cell === null) return '—'
  if (typeof cell === 'string') return cell
  if (typeof cell === 'number' || typeof cell === 'boolean') return String(cell)
  return JSON.stringify(cell)
}
