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
import { writeComposition } from '@/server/functions/composition.functions'

import { FieldRenderer } from './field-renderer'

export interface ComposeFormProps {
  template: WebTemplate
  ehrId: string
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
export function ComposeForm({ template, ehrId, onSuccess }: ComposeFormProps) {
  const rawSchema = generateFormSchema(template)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Wrap in z.record if the root schema is not a ZodObject (e.g. z.unknown() for
  // an empty template). For all practical templates the root is a ZodObject.
  const schema = isRecordSchema(rawSchema)
    ? rawSchema
    : z.record(z.string(), z.unknown())

  const form = useForm<Record<string, unknown>>({
    resolver: zodResolver(schema),
    defaultValues: {},
    mode: 'onBlur',
  })

  const { handleSubmit, control, formState } = form

  const onSubmit = async (values: Record<string, unknown>) => {
    setSubmitError(null)
    try {
      const result = await writeComposition({
        data: {
          ehrId,
          templateId: template.templateId,
          formState: JSON.stringify(values),
        },
      })
      toast.success(m.compose_success({ versionUid: result.versionUid }))
      onSuccess?.(result.versionUid)
    } catch {
      setSubmitError(m.compose_error())
      toast.error(m.compose_error())
    }
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
            ? m.compose_submitting()
            : m.compose_submit()}
        </Button>
      </form>
    </FormProvider>
  )
}
