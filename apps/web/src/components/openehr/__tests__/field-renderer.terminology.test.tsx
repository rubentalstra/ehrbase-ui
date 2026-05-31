// FieldRenderer external-terminology binding test (F2 — ADR-0034).
//
// Verifies the static-Select vs live-combobox heuristic, that an external-binding
// DV_CODED_TEXT renders the live combobox, and that selecting an option yields the
// correct DV_CODED_TEXT form-state `{ code, value, terminology }` (the shape the
// F1 schema + FLAT converter consume — no F1 regression).

import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm, FormProvider } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { z } from 'zod'

import { parseWebTemplate, generateFormSchema } from '@ehrbase-ui/openehr-web-template'
import type { WebTemplate } from '@ehrbase-ui/openehr-web-template'

// Mock the server fn so the combobox resolves against a deterministic expansion.
vi.mock('@/server/functions/terminology.functions', () => ({
  expandValueSet: vi.fn(() =>
    Promise.resolve({
      configured: true,
      total: 1,
      options: [
        { system: 'http://snomed.info/sct', code: '38341003', display: 'Hypertensive disorder' },
      ],
    }),
  ),
}))

import { FieldRenderer } from '../field-renderer'

function isRecordSchema(
  schema: z.ZodTypeAny,
): schema is z.ZodObject<Record<string, z.ZodTypeAny>> {
  return schema instanceof z.ZodObject
}

// Template with TWO coded nodes: one local closed list (static Select), one
// external SNOMED binding (live combobox).
const templateRaw = {
  templateId: 'term.test.v1',
  defaultLanguage: 'en',
  languages: ['en'],
  tree: {
    id: 'obs',
    name: 'Observation',
    rmType: 'COMPOSITION',
    min: 1,
    max: 1,
    children: [
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
            terminology: 'local',
          },
        ],
      },
      {
        id: 'diagnosis',
        name: 'Diagnosis',
        rmType: 'DV_CODED_TEXT',
        min: 0,
        max: 1,
        inputs: [
          { suffix: 'code', type: 'TEXT', terminology: 'SNOMED-CT' },
          { suffix: 'value', type: 'TEXT', terminology: 'SNOMED-CT' },
        ],
      },
    ],
  },
}

let latestValues: Record<string, unknown> = {}

function Harness({ template }: { template: WebTemplate }) {
  const rawSchema = generateFormSchema(template)
  const schema = isRecordSchema(rawSchema) ? rawSchema : z.record(z.string(), z.unknown())
  const form = useForm<Record<string, unknown>>({ resolver: zodResolver(schema), defaultValues: {} })
  latestValues = form.watch()
  return (
    <FormProvider {...form}>
      <form>
        <FieldRenderer node={template.tree} path={template.tree.id} control={form.control} depth={0} />
      </form>
    </FormProvider>
  )
}

function renderHarness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const template = parseWebTemplate(templateRaw)
  return render(
    <QueryClientProvider client={client}>
      <Harness template={template} />
    </QueryClientProvider>,
  )
}

describe('FieldRenderer — external terminology binding', () => {
  it('renders a static Select for a closed local list and a combobox trigger for an external binding', () => {
    renderHarness()
    // Local closed list → static Select (shadcn Select trigger → combobox role).
    expect(screen.getByRole('combobox', { name: 'Category' })).toBeTruthy()
    // External SNOMED binding → a Popover trigger button (label-associated name
    // "Diagnosis"); its visible content is the "Select a code" prompt.
    const trigger = screen.getByRole('button', { name: 'Diagnosis' })
    expect(trigger.textContent).toMatch(/select a code/iu)
  })

  it('selecting an option yields DV_CODED_TEXT form-state { code, value, terminology }', async () => {
    const user = userEvent.setup()
    renderHarness()

    await user.click(screen.getByRole('button', { name: 'Diagnosis' }))
    // Type into the command input to trigger the (mocked) expansion.
    const searchBox = await screen.findByPlaceholderText(/search snomed-ct/iu)
    await user.type(searchBox, 'hyper')

    const option = await screen.findByText('Hypertensive disorder')
    await user.click(option)

    function asRecord(x: unknown): Record<string, unknown> | undefined {
      return typeof x === 'object' && x !== null && !Array.isArray(x) ? { ...x } : undefined
    }

    await waitFor(() => {
      expect(asRecord(asRecord(latestValues['obs'])?.['diagnosis'])).toBeTruthy()
    })
    const diagnosis = asRecord(asRecord(latestValues['obs'])?.['diagnosis'])
    expect(diagnosis).toEqual({
      code: '38341003',
      value: 'Hypertensive disorder',
      terminology: 'SNOMED-CT',
    })
  })
})
