// CompositionViewer — read-only composition display anchored in §7 form pipeline.
//
// Sources its data via the EXISTING `readComposition` server fn (FLAT path →
// flatToFormState) which is the GUARANTEED-working path (verified in M6).
// The STRUCTURED path (structuredToFormState) is available as a future
// alternative; FLAT remains the default here.
//
// Renders the fetched form-state through FieldRenderer in readOnly mode,
// initialising a react-hook-form form with the fetched values as defaultValues.
// No Zod resolver is needed in read-only mode (no submission).
//
// Contract:
//   • templateId + compositionUid + ehrId → readComposition → form-state
//   • form-state → useForm(defaultValues) → FormProvider
//   • FieldRenderer(readOnly=true) → static value display
//
// The metadata header (versionUid + templateId) is rendered above the fields.
// No audit call here: reads in the workbench context do not reach PHI in the
// core-refocus scope (audit returns post-core per CLAUDE.md "Deferred").

import { useMutation, useQuery } from '@tanstack/react-query'
import { useForm, FormProvider } from 'react-hook-form'
import { toast } from 'sonner'

import type { WebTemplate } from '@ehrbase-ui/openehr-web-template'
import { parseWebTemplate } from '@ehrbase-ui/openehr-web-template'
import { m } from '@ehrbase-ui/i18n/messages'

import {
  exportComposition,
  readComposition,
} from '@/server/functions/composition.functions'
import { getWebTemplate } from '@/server/functions/template.functions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import { FieldRenderer } from './field-renderer'

// Trigger a client-side download of the canonical JSON string. Browser-only
// (guarded by typeof document) — no PHI leaves the page beyond the user's own
// save action; the object URL is revoked immediately after the click.
function downloadJson(filename: string, json: string): void {
  if (typeof document === 'undefined') return
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export interface CompositionViewerProps {
  ehrId: string
  templateId: string
  compositionUid: string
}

// Type guard for a plain object (used to narrowing JSON.parse output).
function isPlainRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

// Inner viewer that receives both the parsed template and the form-state values.
interface ViewerInnerProps {
  template: WebTemplate
  formStateValues: Record<string, unknown>
  versionUid: string
  ehrId: string
  compositionUid: string
}

function ViewerInner({
  template,
  formStateValues,
  versionUid,
  ehrId,
  compositionUid,
}: ViewerInnerProps) {
  // Initialise form with the fetched values.  No resolver — read-only, no submit.
  const form = useForm<Record<string, unknown>>({
    defaultValues: formStateValues,
  })

  // Canonical export → client download. The canonical JSON is fetched on demand
  // (not on viewer load) so the read path stays FLAT-only unless the user asks.
  const exportMutation = useMutation({
    mutationFn: () => exportComposition({ data: { ehrId, compositionUid } }),
    onSuccess: (result) => {
      downloadJson(`composition-${compositionUid}.json`, result.canonical)
    },
    onError: () => {
      toast.error(m.viewer_download_failed())
    },
  })

  return (
    <FormProvider {...form}>
      <div className="space-y-4">
        {/* Metadata header */}
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground font-medium">{m.viewer_metadata_version_uid()}</dt>
          <dd className="font-mono break-all">{versionUid}</dd>
          <dt className="text-muted-foreground font-medium">{m.viewer_metadata_template()}</dt>
          <dd>
            <Badge variant="secondary">{template.templateId}</Badge>
          </dd>
        </dl>

        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={exportMutation.isPending}
            onClick={() => exportMutation.mutate()}
          >
            {m.viewer_download_canonical()}
          </Button>
        </div>

        <div className="border-t pt-4">
          {/* FieldRenderer in read-only mode — reuses all rmType renderers from P1.3 */}
          <FieldRenderer
            node={template.tree}
            path={template.tree.id}
            control={form.control}
            depth={0}
            readOnly={true}
          />
        </div>
      </div>
    </FormProvider>
  )
}

/**
 * Fetches a composition (FLAT path → form-state) and renders it read-only
 * through FieldRenderer.  Provides loading / error states.
 *
 * Data flow (§7 read path):
 *   readComposition(ehrId, templateId, compositionUid)
 *     → GET …/composition/{uid}?format=FLAT
 *     → flatToFormState(template, flat)
 *     → JSON string
 *   parseWebTemplate(getWebTemplate(templateId))
 *     → WebTemplate
 *   useForm({ defaultValues: formState })
 *   FieldRenderer(readOnly=true)
 */
export function CompositionViewer({ ehrId, templateId, compositionUid }: CompositionViewerProps) {
  const templateQuery = useQuery({
    queryKey: ['viewer', 'web-template', templateId],
    queryFn: () => getWebTemplate({ data: { templateId } }),
    enabled: Boolean(templateId),
    staleTime: 5 * 60 * 1000,
  })

  const compositionQuery = useQuery({
    queryKey: ['viewer', 'composition', ehrId, compositionUid],
    queryFn: () =>
      readComposition({ data: { ehrId, templateId, compositionUid } }),
    enabled: Boolean(ehrId) && Boolean(compositionUid) && Boolean(templateId),
  })

  if (templateQuery.isPending || compositionQuery.isPending) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label={m.viewer_loading()}>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/4" />
      </div>
    )
  }

  if (templateQuery.isError || compositionQuery.isError) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{m.viewer_load_failed()}</AlertDescription>
      </Alert>
    )
  }

  // Parse the web template JSON string.  Use a helper to keep the ESLint
  // no-useless-assignment rule happy (the value is read in the same branch).
  function tryParseTemplate(): WebTemplate | null {
    try {
      const rawJson: unknown = JSON.parse(templateQuery.data ?? '{}')
      return parseWebTemplate(rawJson)
    } catch {
      return null
    }
  }
  const parsedTemplate = tryParseTemplate()
  if (parsedTemplate === null) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{m.viewer_load_failed()}</AlertDescription>
      </Alert>
    )
  }

  // Parse the form-state JSON string from the server fn.
  let formStateValues: Record<string, unknown> = {}
  try {
    const rawState: unknown = JSON.parse(compositionQuery.data.formState)
    if (isPlainRecord(rawState)) {
      formStateValues = rawState
    }
  } catch {
    // Non-fatal: render with empty defaults — the viewer still shows the template structure.
  }

  return (
    <ViewerInner
      template={parsedTemplate}
      formStateValues={formStateValues}
      versionUid={compositionQuery.data.versionUid}
      ehrId={ehrId}
      compositionUid={compositionUid}
    />
  )
}
