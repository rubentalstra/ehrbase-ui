// Workbench › EHRs (Part C Phase 1). Create a bare EHR and inspect an existing
// one (canonical EHR fields + EHR_STATUS JSON). Wires to the createEhr / getEhr /
// getEhrStatus server fns. All copy via Paraglide (rule 4); shadcn primitives
// only (rule 6). The inspect input is a UUID validated client-side; the server
// re-validates and conflates 404/403.

import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { m } from '@ehrbase-ui/i18n/messages'
import { FeatureErrorBoundary } from '@/components/errors/feature-error-boundary'
import { createEhr, getEhr, getEhrStatus } from '@/server/functions/ehr.functions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/_authed/workbench/ehr')({
  component: EhrWorkbench,
  errorComponent: FeatureErrorBoundary,
})

const UuidSchema = z.uuid()

function EhrWorkbench() {
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [ehrIdInput, setEhrIdInput] = useState('')
  const [inspectId, setInspectId] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => createEhr({ data: {} }),
    onSuccess: (result) => {
      setCreatedId(result.ehrId)
      toast.success(m.workbench_ehr_create_success({ id: result.ehrId }))
    },
    onError: () => {
      toast.error(m.workbench_ehr_create_failed())
    },
  })

  const validInput = UuidSchema.safeParse(ehrIdInput.trim()).success

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{m.workbench_ehr_title()}</h2>
        <p className="text-muted-foreground text-sm">{m.workbench_ehr_subtitle()}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{m.workbench_ehr_create_heading()}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm">
            {m.workbench_ehr_create_hint()}
          </p>
          <Button type="button" disabled={create.isPending} onClick={() => create.mutate()}>
            {m.workbench_ehr_create_submit()}
          </Button>
          {createdId !== null ? (
            <div className="space-y-1">
              <p className="text-sm font-medium">{m.workbench_ehr_created_label()}</p>
              <p className="font-mono text-sm break-all">{createdId}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{m.workbench_ehr_inspect_heading()}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="ehr-id-input">{m.workbench_ehr_inspect_hint()}</Label>
          <div className="flex gap-2">
            <Input
              id="ehr-id-input"
              value={ehrIdInput}
              onChange={(e) => setEhrIdInput(e.target.value)}
              placeholder={m.workbench_ehr_inspect_placeholder()}
              className="font-mono"
            />
            <Button
              type="button"
              disabled={!validInput}
              onClick={() => setInspectId(ehrIdInput.trim())}
            >
              {m.workbench_ehr_inspect_submit()}
            </Button>
          </div>
        </CardContent>
      </Card>

      <EhrDetail ehrId={inspectId} />
    </div>
  )
}

function EhrDetail({ ehrId }: { ehrId: string | null }) {
  const enabled = ehrId !== null
  const ehr = useQuery({
    queryKey: ['workbench', 'ehr', ehrId],
    queryFn: () => getEhr({ data: { ehrId: ehrId ?? '' } }),
    enabled,
  })
  const status = useQuery({
    queryKey: ['workbench', 'ehr-status', ehrId],
    queryFn: () => getEhrStatus({ data: { ehrId: ehrId ?? '' } }),
    enabled,
  })

  if (!enabled) return null

  if (ehr.isError || status.isError) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{m.workbench_ehr_inspect_failed()}</AlertDescription>
      </Alert>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.workbench_ehr_inspect_heading()}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {ehr.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label={m.workbench_ehr_field_id()} value={ehr.data.ehrId} mono />
            <Field
              label={m.workbench_ehr_field_system()}
              value={ehr.data.systemId ?? m.workbench_ehr_value_none()}
            />
            <Field
              label={m.workbench_ehr_field_created()}
              value={ehr.data.timeCreated ?? m.workbench_ehr_value_none()}
            />
          </dl>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">{m.workbench_ehr_status_heading()}</p>
          {status.isPending ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <>
              <p className="text-muted-foreground text-xs">
                {m.workbench_ehr_status_version()}:{' '}
                <span className="font-mono break-all">{status.data.versionUid}</span>
              </p>
              <pre className="bg-muted max-h-80 overflow-auto rounded-md p-4 text-xs">
                {prettyJson(status.data.ehrStatus)}
              </pre>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={mono ? 'font-mono text-sm break-all' : 'text-sm'}>{value}</dd>
    </div>
  )
}

// getEhrStatus returns the EHR_STATUS as a JSON STRING (see ehr.functions.ts).
function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}
