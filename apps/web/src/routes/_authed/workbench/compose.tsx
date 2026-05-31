// Workbench › Compose (P1.3 — FieldRenderer). Developer-facing surface to
// exercise the full form pipeline end-to-end: pick a template + an EHR ID,
// render the ComposeForm, POST to EHRbase via writeComposition.
// All copy via Paraglide (rule 4); shadcn primitives only (rule 6).
// No PHI here — workbench only; the template nodes are DATA (rendered directly).

import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'

import { m } from '@ehrbase-ui/i18n/messages'
import { parseWebTemplate } from '@ehrbase-ui/openehr-web-template'
import { FeatureErrorBoundary } from '@/components/errors/feature-error-boundary'
import { PatientEhrSelect } from '@/components/patient/patient-ehr-select'
import { getWebTemplate } from '@/server/functions/template.functions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { ComposeForm } from '@/components/openehr/compose-form'

export const Route = createFileRoute('/_authed/workbench/compose')({
  component: ComposeWorkbench,
  errorComponent: FeatureErrorBoundary,
})

function ComposeWorkbench() {
  const [templateIdInput, setTemplateIdInput] = useState('')
  const [ehrId, setEhrId] = useState<string | null>(null)
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null)
  const [activeEhrId, setActiveEhrId] = useState<string | null>(null)
  const [versionUid, setVersionUid] = useState<string | null>(null)

  const templateQuery = useQuery({
    queryKey: ['workbench', 'web-template', activeTemplateId],
    queryFn: () => getWebTemplate({ data: { templateId: activeTemplateId ?? '' } }),
    enabled: activeTemplateId !== null,
  })

  function handleLoad() {
    if (templateIdInput.trim() && ehrId) {
      setActiveTemplateId(templateIdInput.trim())
      setActiveEhrId(ehrId)
      setVersionUid(null)
    }
  }

  // Parse the web template JSON string returned by getWebTemplate.
  let parsedTemplate = null
  let parseError: string | null = null
  if (templateQuery.data) {
    try {
      parsedTemplate = parseWebTemplate(JSON.parse(templateQuery.data))
    } catch {
      parseError = m.compose_template_load_failed()
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{m.compose_title()}</h2>
        <p className="text-muted-foreground text-sm">{m.compose_subtitle()}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{m.compose_title()}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="template-id-input">{m.compose_pick_template_label()}</Label>
            <Input
              id="template-id-input"
              value={templateIdInput}
              onChange={(e) => setTemplateIdInput(e.target.value)}
              placeholder={m.compose_pick_template_placeholder()}
              className="font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label>{m.workbench_patient_selected()}</Label>
            <PatientEhrSelect onChange={(id) => setEhrId(id)} />
          </div>
          <Button
            type="button"
            disabled={templateIdInput.trim().length === 0 || ehrId === null}
            onClick={handleLoad}
          >
            {m.compose_load_template()}
          </Button>
        </CardContent>
      </Card>

      {versionUid !== null && (
        <Alert>
          <AlertDescription>
            {m.compose_success({ versionUid })}
          </AlertDescription>
        </Alert>
      )}

      {activeTemplateId !== null && activeEhrId !== null && (
        <Card>
          <CardContent className="pt-6">
            {templateQuery.isPending && (
              <div className="space-y-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-3/4" />
              </div>
            )}
            {templateQuery.isError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{m.compose_template_load_failed()}</AlertDescription>
              </Alert>
            )}
            {parseError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{parseError}</AlertDescription>
              </Alert>
            )}
            {/* activeEhrId is already narrowed to non-null by the enclosing
                guard above — re-checking it here compared `string` to null
                (always true), which CodeQL flagged (js/comparison-between-
                incompatible-types). parsedTemplate is the only check needed. */}
            {parsedTemplate !== null && (
              <ComposeForm
                template={parsedTemplate}
                ehrId={activeEhrId}
                onSuccess={(uid) => {
                  setVersionUid(uid)
                  toast.success(m.compose_success({ versionUid: uid }))
                }}
              />
            )}
          </CardContent>
        </Card>
      )}

      {activeTemplateId === null && (
        <p className="text-muted-foreground text-sm">{m.compose_no_template()}</p>
      )}
    </div>
  )
}
