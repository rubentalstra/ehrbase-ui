// ComposeForm — full openEHR composition form wrapper.
//
// Anchored in: docs/architecture.md §7 (form pipeline).
//
// Wires together:
//   generateFormSchema(template) → zodResolver → useForm
//   FieldRenderer (recursive, rmType-aware) over the template tree
//   writeComposition server fn (FLAT converter is the only writer — rule 2)
//
// The form-state object is validated by the Zod schema generated from the web
// template (no hand-written validation rules). On submit it is passed as
// `formState: JSON.stringify(values)` to writeComposition, which runs the FLAT
// conversion server-side (composition.server.ts). (Audit was removed in the
// core-refocus — it returns post-core; see CLAUDE.md "Deferred".)
//
// Drafts are NOT stored in localStorage (rule 4). If autosave is needed, it
// will use the Valkey server fn path (§7.x autosave); that is out of scope for
// this renderer deliverable.

import { useForm, FormProvider } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import type { WebTemplate } from '@ehrbase-ui/openehr-web-template'
import { generateFormSchema } from '@ehrbase-ui/openehr-web-template'
import { m } from '@ehrbase-ui/i18n/messages'

import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  updateComposition,
  writeComposition,
} from '@/server/functions/composition.functions'

import { ConflictDialog } from './conflict-dialog'
import { FieldRenderer } from './field-renderer'

// When present, the form is in EDIT mode: it updates an existing composition
// (PUT with If-Match) rather than creating a new one (POST). The version_uid is
// the optimistic-concurrency token; a stale one triggers the 412 conflict flow.
export interface ComposeFormExisting {
  compositionUid: string
  versionUid: string
  /** The composition's current form-state, used to seed the form's defaults. */
  initialValues: Record<string, unknown>
}

export interface ComposeFormProps {
  template: WebTemplate
  ehrId: string
  /** Present ⇒ edit an existing composition; absent ⇒ create a new one. */
  existing?: ComposeFormExisting
  /** Called with the resulting versionUid on success. */
  onSuccess?: (versionUid: string) => void
}

// Type predicate: the root node of a web template always produces a z.ZodObject
// via nodeSchema(). This predicate narrows the ZodTypeAny to the specific
// ZodObject type, which satisfies @hookform/resolvers zodResolver's Input constraint
// (FieldValues = Record<string, unknown>). Using a predicate, not a cast.
function isRecordSchema(
  schema: z.ZodTypeAny,
): schema is z.ZodObject<Record<string, z.ZodTypeAny>> {
  return schema instanceof z.ZodObject
}

/**
 * Full composition form for an openEHR web template.
 *
 * - Uses zodResolver(generateFormSchema(template)) — Zod schema from the
 *   web template is the only validation authority (no hand-written rules).
 * - Renders FieldRenderer over the template tree root (the COMPOSITION node).
 * - On submit: calls writeComposition (FLAT conversion + audit happen server-side).
 * - Displays the resulting versionUid via toast on success.
 */
export function ComposeForm({ template, ehrId, existing, onSuccess }: ComposeFormProps) {
  const rawSchema = generateFormSchema(template)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const isEdit = existing !== undefined

  // Conflict state: when an update returns `{ status: "conflict" }`, hold the
  // pending values + the reported latest version_uid so ConflictDialog can diff
  // and offer reload-or-retry.
  const [conflict, setConflict] = useState<{
    pendingValues: Record<string, unknown>
    currentVersionUid: string | null
  } | null>(null)
  const [retrying, setRetrying] = useState(false)
  // The active version_uid for the next If-Match. Starts at the loaded version;
  // a successful retry/save advances it so a second save in the same session is
  // not itself a stale write.
  const [versionUid, setVersionUid] = useState(existing?.versionUid ?? '')

  // Wrap in z.record if the root schema is not a ZodObject (e.g. z.unknown() for
  // an empty template). For all practical templates the root is a ZodObject.
  const schema = isRecordSchema(rawSchema)
    ? rawSchema
    : z.record(z.string(), z.unknown())

  const form = useForm<Record<string, unknown>>({
    resolver: zodResolver(schema),
    defaultValues: existing?.initialValues ?? {},
    mode: 'onBlur',
  })

  const { handleSubmit, control, formState } = form

  // CREATE path (POST). Unchanged from the original deliverable.
  async function create(values: Record<string, unknown>) {
    const result = await writeComposition({
      data: { ehrId, templateId: template.templateId, formState: JSON.stringify(values) },
    })
    toast.success(m.compose_success({ versionUid: result.versionUid }))
    onSuccess?.(result.versionUid)
  }

  // UPDATE path (PUT + If-Match). On a 412 the server returns a typed conflict
  // result instead of throwing — open the ConflictDialog rather than erroring.
  async function update(
    values: Record<string, unknown>,
    ifMatchVersionUid: string,
  ): Promise<'ok' | 'conflict'> {
    if (existing === undefined) return 'ok'
    const result = await updateComposition({
      data: {
        ehrId,
        templateId: template.templateId,
        compositionUid: existing.compositionUid,
        versionUid: ifMatchVersionUid,
        formState: JSON.stringify(values),
      },
    })
    if (result.status === 'conflict') {
      setConflict({ pendingValues: values, currentVersionUid: result.currentVersionUid })
      return 'conflict'
    }
    setVersionUid(result.versionUid)
    toast.success(m.compose_update_success({ versionUid: result.versionUid }))
    onSuccess?.(result.versionUid)
    return 'ok'
  }

  const onSubmit = async (values: Record<string, unknown>) => {
    setSubmitError(null)
    try {
      if (isEdit) {
        await update(values, versionUid)
      } else {
        await create(values)
      }
    } catch {
      setSubmitError(m.compose_error())
      toast.error(m.compose_error())
    }
  }

  // Conflict resolution (b): re-apply the user's pending changes onto the latest
  // version_uid and retry the update. A second conflict re-opens the dialog with
  // the newer version.
  async function retryOnLatest(latestVersionUid: string) {
    if (conflict === null) return
    setRetrying(true)
    setSubmitError(null)
    try {
      const outcome = await update(conflict.pendingValues, latestVersionUid)
      if (outcome === 'ok') setConflict(null)
    } catch {
      setSubmitError(m.compose_error())
      toast.error(m.compose_error())
      setConflict(null)
    } finally {
      setRetrying(false)
    }
  }

  // Conflict resolution (a): discard the user's edits and reload the latest
  // server version. Delegated to the host (it owns the composition source) via
  // onSuccess with the reported latest version, falling back to a plain close.
  function reloadDiscard() {
    setConflict(null)
    if (conflict?.currentVersionUid) onSuccess?.(conflict.currentVersionUid)
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        {submitError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}

        <FieldRenderer
          node={template.tree}
          path={template.tree.id}
          control={control}
          depth={0}
        />

        <Button
          type="submit"
          disabled={formState.isSubmitting}
          className="w-full sm:w-auto"
        >
          {formState.isSubmitting
            ? isEdit
              ? m.compose_update_submitting()
              : m.compose_submitting()
            : isEdit
              ? m.compose_update_submit()
              : m.compose_submit()}
        </Button>
      </form>

      {existing !== undefined && conflict !== null && (
        <ConflictDialog
          open={true}
          ehrId={ehrId}
          templateId={template.templateId}
          compositionUid={existing.compositionUid}
          currentVersionUid={conflict.currentVersionUid}
          pendingValues={conflict.pendingValues}
          isRetrying={retrying}
          onReloadDiscard={reloadDiscard}
          onRetryOnLatest={retryOnLatest}
          onCancel={() => setConflict(null)}
        />
      )}
    </FormProvider>
  )
}
