// Workbench › Directory (F4 — DIRECTORY / FOLDER tree). View an EHR's directory
// (its root FOLDER tree) and create one from canonical FOLDER JSON. Wires to the
// getDirectory / createDirectory server fns. All copy via Paraglide (rule 4);
// shadcn primitives only (rule 6). No PHI here — workbench only; the FOLDER tree
// is structural metadata, rendered as pretty JSON.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { m } from '@ehrbase-ui/i18n/messages'
import { FeatureErrorBoundary } from '@/components/errors/feature-error-boundary'
import {
  createDirectory,
  getDirectory,
  type JsonValue,
} from '@/server/functions/directory.functions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'

export const Route = createFileRoute('/_authed/workbench/directory')({
  component: DirectoryWorkbench,
  errorComponent: FeatureErrorBoundary,
})

const UuidSchema = z.uuid()

function DirectoryWorkbench() {
  const queryClient = useQueryClient()
  const [ehrIdInput, setEhrIdInput] = useState('')
  const [activeEhrId, setActiveEhrId] = useState<string | null>(null)
  const [folderJson, setFolderJson] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  const validEhrId = UuidSchema.safeParse(ehrIdInput.trim()).success
  const directoryKey = ['workbench', 'directory', activeEhrId] as const

  const directory = useQuery({
    queryKey: directoryKey,
    queryFn: () => getDirectory({ data: { ehrId: activeEhrId ?? '' } }),
    enabled: activeEhrId !== null,
    retry: false,
  })

  const create = useMutation({
    mutationFn: (folder: JsonValue) =>
      createDirectory({ data: { ehrId: activeEhrId ?? '', folder } }),
    onSuccess: async (result) => {
      toast.success(m.workbench_directory_create_success({ versionUid: result.versionUid }))
      setFolderJson('')
      await queryClient.invalidateQueries({ queryKey: directoryKey })
    },
    onError: () => {
      toast.error(m.workbench_directory_create_failed())
    },
  })

  function handleLoad() {
    if (!validEhrId) return
    setActiveEhrId(ehrIdInput.trim())
  }

  function handleCreate() {
    setCreateError(null)
    if (activeEhrId === null) return
    let parsed: unknown
    try {
      parsed = JSON.parse(folderJson)
    } catch {
      setCreateError(m.workbench_directory_create_invalid_json())
      return
    }
    // z.json() is the serialisable JSON value the server fn input expects; parse
    // here so an invalid shape is caught before the round-trip (no `as`, rule 3).
    const asJson = z.json().safeParse(parsed)
    if (!asJson.success) {
      setCreateError(m.workbench_directory_create_invalid_json())
      return
    }
    create.mutate(asJson.data)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{m.workbench_directory_title()}</h2>
        <p className="text-muted-foreground text-sm">{m.workbench_directory_subtitle()}</p>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-1">
            <Label htmlFor="directory-ehr-id">{m.workbench_directory_ehr_id_label()}</Label>
            <Input
              id="directory-ehr-id"
              value={ehrIdInput}
              onChange={(e) => setEhrIdInput(e.target.value)}
              placeholder={m.workbench_directory_ehr_id_placeholder()}
              className="font-mono"
            />
          </div>
          <Button type="button" disabled={!validEhrId} onClick={handleLoad}>
            {m.workbench_directory_load()}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{m.workbench_directory_tree_heading()}</CardTitle>
        </CardHeader>
        <CardContent>
          {activeEhrId === null ? (
            <p className="text-muted-foreground text-sm">{m.workbench_directory_no_ehr()}</p>
          ) : directory.isPending ? (
            <Skeleton className="h-48 w-full" />
          ) : directory.isError ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{m.workbench_directory_load_failed()}</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs">
                {m.workbench_directory_version_label()}:{' '}
                <span className="font-mono break-all">
                  {directory.data.versionUid ?? m.stored_query_value_none()}
                </span>
              </p>
              <pre className="bg-muted max-h-96 overflow-auto rounded-md p-4 text-xs">
                {JSON.stringify(directory.data.folder, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{m.workbench_directory_create_heading()}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="directory-folder-json">{m.workbench_directory_create_hint()}</Label>
          <Textarea
            id="directory-folder-json"
            value={folderJson}
            onChange={(e) => setFolderJson(e.target.value)}
            placeholder={m.workbench_directory_create_placeholder()}
            rows={6}
            className="font-mono text-xs"
          />
          {createError !== null && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{createError}</AlertDescription>
            </Alert>
          )}
          <Button
            type="button"
            disabled={activeEhrId === null || folderJson.trim().length === 0 || create.isPending}
            onClick={handleCreate}
          >
            {m.workbench_directory_create_submit()}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
