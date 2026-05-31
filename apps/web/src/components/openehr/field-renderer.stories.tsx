// Storybook story for FieldRenderer — one story per major rmType group.
// Storybook 10 / @storybook/react-vite.

import type { Meta, StoryObj } from '@storybook/react-vite'
import { useForm, FormProvider } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { parseWebTemplate, generateFormSchema } from '@ehrbase-ui/openehr-web-template'
import type { WebTemplate } from '@ehrbase-ui/openehr-web-template'
import { FieldRenderer } from './field-renderer'

// Type predicate: narrows ZodTypeAny to ZodObject so zodResolver sees the
// correct Input type (FieldValues = Record<string, unknown>). Not a cast.
function isRecordSchema(
  schema: z.ZodTypeAny,
): schema is z.ZodObject<Record<string, z.ZodTypeAny>> {
  return schema instanceof z.ZodObject
}

// Wrapper that provides the RHF context Storybook stories need.
function StoryWrapper({ template }: { template: WebTemplate }) {
  const rawSchema = generateFormSchema(template)
  const schema = isRecordSchema(rawSchema) ? rawSchema : z.record(z.string(), z.unknown())
  const form = useForm<Record<string, unknown>>({
    resolver: zodResolver(schema),
    defaultValues: {},
  })

  return (
    <FormProvider {...form}>
      <form className="max-w-lg space-y-4 p-4">
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

// ── Representative templates ─────────────────────────────────────────────────

const textAndQuantityTemplate = parseWebTemplate({
  templateId: 'story.text-quantity.v1',
  defaultLanguage: 'en',
  languages: ['en'],
  tree: {
    id: 'demo',
    name: 'Text and Quantity',
    rmType: 'COMPOSITION',
    min: 1,
    max: 1,
    children: [
      {
        id: 'note',
        name: 'Clinical note',
        rmType: 'DV_TEXT',
        min: 0,
        max: 1,
        inputs: [{ type: 'TEXT' }],
      },
      {
        id: 'label',
        name: 'Short label',
        rmType: 'DV_TEXT',
        min: 1,
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
          { suffix: 'magnitude', type: 'DECIMAL', validation: { range: { min: 0, minOp: '>=' } } },
          {
            suffix: 'unit',
            type: 'CODED_TEXT',
            list: [
              { value: 'kg', label: 'kg' },
              { value: 'g', label: 'g' },
              { value: 'lb', label: 'lb' },
            ],
          },
        ],
      },
    ],
  },
})

const selectAndBooleanTemplate = parseWebTemplate({
  templateId: 'story.select-bool.v1',
  defaultLanguage: 'en',
  languages: ['en'],
  tree: {
    id: 'demo',
    name: 'Select and Boolean',
    rmType: 'COMPOSITION',
    min: 1,
    max: 1,
    children: [
      {
        id: 'category',
        name: 'Category',
        rmType: 'DV_CODED_TEXT',
        min: 1,
        max: 1,
        inputs: [
          {
            suffix: 'code',
            type: 'CODED_TEXT',
            list: [
              { value: '433', label: 'Event' },
              { value: '434', label: 'Admin' },
              { value: '435', label: 'Referral' },
            ],
            terminology: 'openehr',
          },
        ],
      },
      {
        id: 'priority',
        name: 'Priority',
        rmType: 'DV_ORDINAL',
        min: 0,
        max: 1,
        inputs: [
          {
            suffix: 'code',
            type: 'CODED_TEXT',
            list: [
              { value: 'low', label: 'Low', ordinal: 1 },
              { value: 'medium', label: 'Medium', ordinal: 2 },
              { value: 'high', label: 'High', ordinal: 3 },
            ],
          },
        ],
      },
      {
        id: 'active',
        name: 'Active patient',
        rmType: 'DV_BOOLEAN',
        min: 0,
        max: 1,
        inputs: [{ type: 'BOOLEAN' }],
      },
    ],
  },
})

const dateAndCountTemplate = parseWebTemplate({
  templateId: 'story.date-count.v1',
  defaultLanguage: 'en',
  languages: ['en'],
  tree: {
    id: 'demo',
    name: 'Date and Count',
    rmType: 'COMPOSITION',
    min: 1,
    max: 1,
    children: [
      {
        id: 'dob',
        name: 'Date of birth',
        rmType: 'DV_DATE',
        min: 0,
        max: 1,
        inputs: [{ type: 'DATE' }],
      },
      {
        id: 'observed_at',
        name: 'Observed at',
        rmType: 'DV_DATE_TIME',
        min: 0,
        max: 1,
        inputs: [{ type: 'DATETIME' }],
      },
      {
        id: 'heart_rate',
        name: 'Heart rate',
        rmType: 'DV_COUNT',
        min: 0,
        max: 1,
        inputs: [{ type: 'INTEGER', validation: { range: { min: 0, minOp: '>=' } } }],
      },
    ],
  },
})

const arrayTemplate = parseWebTemplate({
  templateId: 'story.array.v1',
  defaultLanguage: 'en',
  languages: ['en'],
  tree: {
    id: 'demo',
    name: 'Array field',
    rmType: 'COMPOSITION',
    min: 1,
    max: 1,
    children: [
      {
        id: 'tags',
        name: 'Tags',
        rmType: 'DV_TEXT',
        min: 0,
        max: -1,
        inputs: [{ type: 'TEXT', validation: { range: { max: 40 } } }],
      },
    ],
  },
})

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'openEHR/FieldRenderer',
  component: StoryWrapper,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StoryWrapper>

export default meta
type Story = StoryObj<typeof meta>

// ── Stories ───────────────────────────────────────────────────────────────────

export const TextAndQuantity: Story = {
  args: { template: textAndQuantityTemplate },
}

export const SelectAndBoolean: Story = {
  args: { template: selectAndBooleanTemplate },
}

export const DateAndCount: Story = {
  args: { template: dateAndCountTemplate },
}

export const ArrayField: Story = {
  args: { template: arrayTemplate },
}
