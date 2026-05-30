// openEHR ArrayFieldRenderer — multiply-occurring node renderer.
//
// Anchored in: docs/architecture.md §7 (form pipeline, array/cardinality handling).
//
// The ArrayFieldRenderer is exported here as a standalone component for
// consumers that want to reference it directly (e.g. tests and Storybook).
// The implementation delegates to the ArrayRendererInternal inside
// field-renderer.tsx to avoid a circular import; this file re-exports a
// thin wrapper that forwards props to FieldRenderer with a guaranteed multi
// node.
//
// CONTRACT: the form-state shape for array fields is z.array(itemSchema)
// as built by generateFormSchema (withCardinality). Each array item is the
// same Zod shape as a single occurrence. useFieldArray from react-hook-form
// manages the add/remove; the array indices become :index in the FLAT path
// via formStateToFlat.

import { type Control } from 'react-hook-form'

import type { WebTemplateNode } from '@ehrbase-ui/openehr-web-template'

import { FieldRenderer } from './field-renderer'

export interface ArrayFieldRendererProps {
  node: WebTemplateNode
  /** Dot-notation RHF path to the array field. */
  path: string
  control: Control<Record<string, unknown>>
  depth?: number
}

/**
 * Renders a multiply-occurring WebTemplate node.
 * Delegates to FieldRenderer which routes to ArrayRendererInternal internally.
 * The node must have max > 1 or max === -1.
 */
export function ArrayFieldRenderer({
  node,
  path,
  control,
  depth = 0,
}: ArrayFieldRendererProps) {
  return (
    <FieldRenderer
      node={node}
      path={path}
      control={control}
      depth={depth}
    />
  )
}
