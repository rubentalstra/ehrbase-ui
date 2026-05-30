// FieldRenderer a11y test — no axe violations on a representative template.
//
// Uses the same axe configuration as the Button baseline test (§12.4).
// The template used here covers DV_TEXT, DV_QUANTITY, DV_BOOLEAN, DV_CODED_TEXT,
// DV_COUNT, DV_DATE_TIME — the most common clinical leaf types.

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { useForm, FormProvider } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { parseWebTemplate, generateFormSchema } from '@ehrbase-ui/openehr-web-template'
import type { WebTemplate } from '@ehrbase-ui/openehr-web-template'
import { axeConfig } from '@/test/axe-config'
import { FieldRenderer } from '../field-renderer'

// Type predicate: narrows ZodTypeAny to ZodObject for zodResolver Input constraint.
function isRecordSchema(
  schema: z.ZodTypeAny,
): schema is z.ZodObject<Record<string, z.ZodTypeAny>> {
  return schema instanceof z.ZodObject
}

// Small representative template — covers the main leaf rmTypes.
const sampleTemplateRaw = {
  templateId: 'a11y.test.v1',
  defaultLanguage: 'en',
  languages: ['en'],
  tree: {
    id: 'vitals',
    name: 'Vitals',
    rmType: 'COMPOSITION',
    min: 1,
    max: 1,
    children: [
      {
        id: 'note',
        name: 'Note',
        rmType: 'DV_TEXT',
        min: 0,
        max: 1,
        inputs: [{ type: 'TEXT', validation: { range: { max: 40 } } }],
      },
      {
        id: 'weight',
        name: 'Weight',
        rmType: 'DV_QUANTITY',
        min: 0,
        max: 1,
        inputs: [
          { suffix: 'magnitude', type: 'DECIMAL' },
          {
            suffix: 'unit',
            type: 'CODED_TEXT',
            list: [{ value: 'kg', label: 'kg' }],
          },
        ],
      },
      {
        id: 'active',
        name: 'Active',
        rmType: 'DV_BOOLEAN',
        min: 0,
        max: 1,
        inputs: [{ type: 'BOOLEAN' }],
      },
      {
        id: 'category',
        name: 'Category',
        rmType: 'DV_CODED_TEXT',
        min: 0,
        max: 1,
        inputs: [
          {
            suffix: 'code',
            type: 'CODED_TEXT',
            list: [
              { value: '433', label: 'Event' },
              { value: '434', label: 'Admin' },
            ],
            terminology: 'openehr',
          },
        ],
      },
      {
        id: 'count',
        name: 'Count',
        rmType: 'DV_COUNT',
        min: 0,
        max: 1,
        inputs: [{ type: 'INTEGER' }],
      },
      {
        id: 'observed',
        name: 'Observed',
        rmType: 'DV_DATE_TIME',
        min: 0,
        max: 1,
        inputs: [{ type: 'DATETIME' }],
      },
    ],
  },
}

// Wrapper component that provides RHF context.
function FieldRendererWrapper({ template }: { template: WebTemplate }) {
  const rawSchema = generateFormSchema(template)
  const schema = isRecordSchema(rawSchema) ? rawSchema : z.record(z.string(), z.unknown())
  const form = useForm<Record<string, unknown>>({
    resolver: zodResolver(schema),
    defaultValues: {},
  })

  return (
    <FormProvider {...form}>
      <form>
        <FieldRenderer
          node={template.tree}
          path={template.tree.id}
          control={form.control}
          depth={0}
        />
      </form>
    </FormProvider>
  )
}

describe('FieldRenderer accessibility', () => {
  it('has no axe violations on a representative template', async () => {
    const template = parseWebTemplate(sampleTemplateRaw)
    const { container } = render(<FieldRendererWrapper template={template} />)
    const results = await axe(container, axeConfig)
    expect(results).toHaveNoViolations()
  })

  it('renders all leaf inputs with associated labels', () => {
    const template = parseWebTemplate(sampleTemplateRaw)
    const { getByLabelText } = render(<FieldRendererWrapper template={template} />)
    // Each leaf must have a label associated with its input by htmlFor/id.
    // DV_TEXT → short text → Input with Label
    expect(getByLabelText('Note')).toBeTruthy()
    // DV_BOOLEAN → Switch with Label
    expect(getByLabelText('Active')).toBeTruthy()
    // DV_COUNT → Input with Label
    expect(getByLabelText('Count')).toBeTruthy()
    // DV_DATE_TIME → Input type=datetime-local with Label
    expect(getByLabelText('Observed')).toBeTruthy()
  })
})
