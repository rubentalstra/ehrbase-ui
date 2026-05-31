// Workbench › AQL (Part C Phase 1). Run an ad-hoc AQL query against EHRbase and
// render the RESULT_SET as a table — scalar cells as text, object/array cells as
// compact JSON. Wires to the executeAql server fn. All copy via Paraglide (rule
// 4); shadcn primitives only (rule 6). Note: AQL CAN reach PHI, but this is the
// engine-first workbench — the audit/observability layer was deliberately
// removed for Phase 1 (per task scope).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import {
  getStoredQuery,
  listStoredQueries,
  putStoredQuery,
  runStoredQuery,
} from '@/server/functions/stored-query.functions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

export const Route = createFileRoute('/_authed/workbench/aql')({
  component: AqlWorkbench,
  errorComponent: FeatureErrorBoundary,
})

const STARTER_QUERY = 'SELECT e/ehr_id/value FROM EHR e LIMIT 25'

function AqlWorkbench() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{m.workbench_aql_title()}</h2>
        <p className="text-muted-foreground text-sm">{m.workbench_aql_subtitle()}</p>
      </div>

      <Tabs defaultValue="adhoc" className="space-y-4">
        <TabsList>
          <TabsTrigger value="adhoc">{m.workbench_aql_tab_adhoc()}</TabsTrigger>
          <TabsTrigger value="stored">{m.workbench_aql_tab_stored()}</TabsTrigger>
        </TabsList>
        <TabsContent value="adhoc" className="space-y-6">
          <AdhocQueryPanel />
        </TabsContent>
        <TabsContent value="stored" className="space-y-6">
          <StoredQueryPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function AdhocQueryPanel() {
  const [query, setQuery] = useState(STARTER_QUERY)

  const run = useMutation({
    mutationFn: (q: string) => executeAql({ data: { q } }),
    onError: () => {
      toast.error(m.workbench_aql_failed())
    },
  })

  return (
    <>
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
    </>
  )
}

const STORED_QUERY_LIST_KEY = ['workbench', 'stored-queries'] as const

function StoredQueryPanel() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [version, setVersion] = useState('')
  const [aql, setAql] = useState(STARTER_QUERY)

  const list = useQuery({
    queryKey: STORED_QUERY_LIST_KEY,
    queryFn: () => listStoredQueries({ data: {} }),
  })

  const save = useMutation({
    mutationFn: () =>
      putStoredQuery({
        data: {
          name: name.trim(),
          aql,
          ...(version.trim() ? { version: version.trim() } : {}),
        },
      }),
    onSuccess: async (result) => {
      toast.success(m.stored_query_save_success({ name: result.name }))
      await queryClient.invalidateQueries({ queryKey: STORED_QUERY_LIST_KEY })
    },
    onError: () => {
      toast.error(m.stored_query_save_failed())
    },
  })

  const run = useMutation({
    mutationFn: (input: { name: string; version: string | null }) =>
      runStoredQuery({
        data: {
          name: input.name,
          ...(input.version ? { version: input.version } : {}),
        },
      }),
    onError: () => {
      toast.error(m.stored_query_run_failed())
    },
  })

  async function loadIntoEditor(queryName: string, queryVersion: string | null) {
    const def = await getStoredQuery({
      data: { name: queryName, ...(queryVersion ? { version: queryVersion } : {}) },
    })
    setName(def.name)
    setVersion(def.version ?? '')
    setAql(def.query)
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{m.stored_query_save_heading()}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="stored-query-name">{m.stored_query_name_label()}</Label>
              <Input
                id="stored-query-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={m.stored_query_name_placeholder()}
                className="font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="stored-query-version">{m.stored_query_version_label()}</Label>
              <Input
                id="stored-query-version"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder={m.stored_query_version_placeholder()}
                className="font-mono"
              />
            </div>
          </div>
          <Label htmlFor="stored-query-aql">{m.stored_query_aql_label()}</Label>
          <Textarea
            id="stored-query-aql"
            value={aql}
            onChange={(e) => setAql(e.target.value)}
            rows={5}
            className="font-mono text-sm"
          />
          <Button
            type="button"
            disabled={name.trim().length === 0 || aql.trim().length === 0 || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? m.stored_query_saving() : m.stored_query_save()}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{m.stored_query_list_heading()}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={list.isFetching}
            onClick={() => list.refetch()}
          >
            {list.isFetching ? m.stored_query_list_loading() : m.stored_query_list_load()}
          </Button>
          {list.isError ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{m.stored_query_list_failed()}</AlertDescription>
            </Alert>
          ) : list.isPending ? (
            <p className="text-muted-foreground text-sm">{m.stored_query_list_loading()}</p>
          ) : list.data.length === 0 ? (
            <p className="text-muted-foreground text-sm">{m.stored_query_list_empty()}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.stored_query_col_name()}</TableHead>
                  <TableHead>{m.stored_query_col_version()}</TableHead>
                  <TableHead>{m.stored_query_col_type()}</TableHead>
                  <TableHead className="text-right">{m.stored_query_col_actions()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.map((q) => (
                  <TableRow key={`${q.name}@${q.version ?? ''}`}>
                    <TableCell className="font-mono text-xs">{q.name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {q.version ?? m.stored_query_value_none()}
                    </TableCell>
                    <TableCell>{q.type ?? m.stored_query_value_none()}</TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void loadIntoEditor(q.name, q.version)}
                      >
                        {m.stored_query_load()}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={run.isPending}
                        onClick={() => run.mutate({ name: q.name, version: q.version })}
                      >
                        {run.isPending ? m.stored_query_running() : m.stored_query_run()}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{m.stored_query_results_heading()}</CardTitle>
        </CardHeader>
        <CardContent>
          {run.isError ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{m.stored_query_run_failed()}</AlertDescription>
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
    </>
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
