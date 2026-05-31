// Workbench › Templates (Part C Phase 1). Lists the operational templates stored
// in EHRbase (ADL 1.4), lets you upload an OPT, and inspects a template's web
// template as pretty JSON. Wires to the listTemplates / uploadTemplate /
// getWebTemplate server fns. All copy via Paraglide (rule 4); shadcn primitives
// only (rule 6). No PHI here — DEFINITION-layer artefacts only.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { type ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { m } from '@ehrbase-ui/i18n/messages'
import { FeatureErrorBoundary } from '@/components/errors/feature-error-boundary'
import {
  getWebTemplate,
  listTemplates,
  type TemplateSummary,
  uploadTemplate,
} from '@/server/functions/template.functions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable } from '@/components/ui/data-table'
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'

export const Route = createFileRoute('/_authed/workbench/templates')({
  component: TemplatesWorkbench,
  errorComponent: FeatureErrorBoundary,
})

const TEMPLATE_LIST_KEY = ['workbench', 'templates'] as const

function TemplatesWorkbench() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [opt, setOpt] = useState('')

  const list = useQuery({
    queryKey: TEMPLATE_LIST_KEY,
    queryFn: () => listTemplates(),
  })

  const upload = useMutation({
    mutationFn: (xml: string) => uploadTemplate({ data: { opt: xml } }),
    onSuccess: async (result) => {
      toast.success(m.workbench_templates_upload_success({ id: result.templateId }))
      setOpt('')
      await queryClient.invalidateQueries({ queryKey: TEMPLATE_LIST_KEY })
    },
    onError: () => {
      toast.error(m.workbench_templates_upload_failed())
    },
  })

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{m.workbench_templates_title()}</h2>
        <p className="text-muted-foreground text-sm">
          {m.workbench_templates_subtitle()}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{m.workbench_templates_upload_heading()}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="opt-input">{m.workbench_templates_upload_hint()}</Label>
          <Textarea
            id="opt-input"
            value={opt}
            onChange={(e) => setOpt(e.target.value)}
            placeholder={m.workbench_templates_upload_placeholder()}
            rows={6}
            className="font-mono text-xs"
          />
          <Button
            type="button"
            disabled={opt.trim().length === 0 || upload.isPending}
            onClick={() => upload.mutate(opt)}
          >
            {m.workbench_templates_upload_submit()}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{m.workbench_templates_list_heading()}</CardTitle>
        </CardHeader>
        <CardContent>
          <TemplateList
            query={list}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </CardContent>
      </Card>

      <TemplateDetail templateId={selectedId} />
    </div>
  )
}

// Columns for the template list. The action column carries no header (empty th)
// and is non-sortable; the data columns get a sortable DataTableColumnHeader.
function templateColumns(
  onSelect: (id: string) => void,
): ColumnDef<TemplateSummary, unknown>[] {
  return [
    {
      accessorKey: 'templateId',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={m.workbench_templates_col_id()} />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.templateId}</span>
      ),
    },
    {
      accessorKey: 'conceptName',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={m.workbench_templates_col_concept()} />
      ),
      cell: ({ row }) => <>{row.original.conceptName ?? m.workbench_ehr_value_none()}</>,
    },
    {
      accessorKey: 'createdTimestamp',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={m.workbench_templates_col_created()} />
      ),
      cell: ({ row }) => <>{row.original.createdTimestamp ?? m.workbench_ehr_value_none()}</>,
    },
    {
      id: 'actions',
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onSelect(row.original.templateId)}
        >
          {m.workbench_templates_view()}
        </Button>
      ),
    },
  ]
}

function TemplateList({
  query,
  selectedId,
  onSelect,
}: {
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof listTemplates>>>>
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const columns = useMemo(() => templateColumns(onSelect), [onSelect])

  if (query.isPending) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    )
  }

  if (query.isError) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{m.workbench_templates_load_failed()}</AlertDescription>
      </Alert>
    )
  }

  if (query.data.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {m.workbench_templates_empty()}
      </p>
    )
  }

  return (
    <DataTable
      columns={columns}
      data={query.data}
      caption={m.workbench_templates_list_heading()}
      getRowId={(t) => t.templateId}
      selectedRowId={selectedId}
      enablePagination={false}
    />
  )
}

function TemplateDetail({ templateId }: { templateId: string | null }) {
  const detail = useQuery({
    queryKey: ['workbench', 'web-template', templateId],
    queryFn: () => getWebTemplate({ data: { templateId: templateId ?? '' } }),
    enabled: templateId !== null,
  })

  if (templateId === null) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-6 text-sm">
          {m.workbench_templates_detail_hint()}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.workbench_templates_detail_heading({ id: templateId })}</CardTitle>
      </CardHeader>
      <CardContent>
        {detail.isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : detail.isError ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              {m.workbench_templates_detail_failed()}
            </AlertDescription>
          </Alert>
        ) : (
          <pre className="bg-muted max-h-96 overflow-auto rounded-md p-4 text-xs">
            {prettyJson(detail.data)}
          </pre>
        )}
      </CardContent>
    </Card>
  )
}

// getWebTemplate returns the web template as a JSON STRING (see template.functions.ts).
// Re-indent it for display; if it somehow isn't JSON, show it verbatim.
function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}
