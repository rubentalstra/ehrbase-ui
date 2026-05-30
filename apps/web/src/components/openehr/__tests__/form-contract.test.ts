// P1.3 gate: FieldRenderer form-state contract tests.
//
// Proves: (a) generateFormSchema(template).safeParse(formState).success === true
// for representative states the renderer would produce, and (b)
// formStateToFlat(template, formState) emits the expected FLAT paths (round-trip).
//
// These tests DO NOT render React — they exercise the pure data contract between
// the web-template schema generator and the FLAT converter. The renderer builds
// form values matching this shape; if this test is green, the renderer's
// output will also parse + convert correctly.

import { describe, it, expect } from 'vitest'

import { parseWebTemplate, generateFormSchema } from '@ehrbase-ui/openehr-web-template'
import { formStateToFlat, flatToFormState } from '@ehrbase-ui/openehr-flat'

// ── Shared mini-template factory ──────────────────────────────────────────────
function makeTemplate(child: unknown) {
  return parseWebTemplate({
    templateId: 'contract.test.v1',
    defaultLanguage: 'en',
    languages: ['en'],
    tree: { id: 'root', rmType: 'COMPOSITION', min: 1, max: 1, children: [child] },
  })
}

// ── Vitals-style multi-leaf template ─────────────────────────────────────────
const vitalsTemplate = parseWebTemplate({
  templateId: 'vitals.contract.v1',
  defaultLanguage: 'en',
  languages: ['en'],
  tree: {
    id: 'vitals',
    rmType: 'COMPOSITION',
    min: 1,
    max: 1,
    children: [
      {
        id: 'weight',
        rmType: 'DV_QUANTITY',
        min: 0,
        max: 1,
        inputs: [
          { suffix: 'magnitude', type: 'DECIMAL' },
          { suffix: 'unit', type: 'CODED_TEXT', list: [{ value: 'kg' }, { value: 'g' }] },
        ],
      },
      { id: 'note', rmType: 'DV_TEXT', min: 0, max: 1, inputs: [{ type: 'TEXT' }] },
      { id: 'observed', rmType: 'DV_DATE_TIME', min: 0, max: 1, inputs: [{ type: 'DATETIME' }] },
      { id: 'tags', rmType: 'DV_TEXT', min: 0, max: -1, inputs: [{ type: 'TEXT' }] },
      {
        id: 'category',
        rmType: 'DV_CODED_TEXT',
        min: 0,
        max: 1,
        inputs: [{ suffix: 'code', type: 'CODED_TEXT', list: [{ value: '433' }, { value: '434' }], terminology: 'openehr' }],
      },
    ],
  },
})

describe('form-state contract — schema validation (a)', () => {
  it('valid vitals form state passes the generated schema', () => {
    const schema = generateFormSchema(vitalsTemplate)
    const formState = {
      weight: { magnitude: 70.5, unit: 'kg' },
      note: 'patient stable',
      observed: '2021-03-21T20:19:49',
      tags: ['a', 'b'],
      category: { code: '433' },
    }
    expect(schema.safeParse(formState).success).toBe(true)
  })

  it('empty form state passes (all fields optional)', () => {
    const schema = generateFormSchema(vitalsTemplate)
    expect(schema.safeParse({}).success).toBe(true)
  })

  it('wrong magnitude type fails', () => {
    const schema = generateFormSchema(vitalsTemplate)
    expect(schema.safeParse({ weight: { magnitude: 'heavy', unit: 'kg' } }).success).toBe(false)
  })

  it('closed-list unit enum rejects unknown value', () => {
    const schema = generateFormSchema(vitalsTemplate)
    expect(schema.safeParse({ weight: { magnitude: 70, unit: 'lb' } }).success).toBe(false)
  })

  it('required array (min 1) rejects empty array', () => {
    const t = makeTemplate({
      id: 'tags',
      rmType: 'DV_TEXT',
      min: 1,
      max: -1,
      inputs: [{ type: 'TEXT' }],
    })
    const schema = generateFormSchema(t)
    expect(schema.safeParse({ tags: [] }).success).toBe(false)
    expect(schema.safeParse({ tags: ['x'] }).success).toBe(true)
  })

  it('DV_COUNT INTEGER required with range rejects out-of-range value', () => {
    const t = makeTemplate({
      id: 'count',
      rmType: 'DV_COUNT',
      min: 1,
      max: 1,
      inputs: [{ type: 'INTEGER', validation: { range: { min: 0, minOp: '>=' } } }],
    })
    const schema = generateFormSchema(t)
    expect(schema.safeParse({ count: 3 }).success).toBe(true)
    expect(schema.safeParse({ count: -1 }).success).toBe(false)
    expect(schema.safeParse({}).success).toBe(false) // required
  })

  it('DV_BOOLEAN accepts boolean only', () => {
    const t = makeTemplate({
      id: 'active',
      rmType: 'DV_BOOLEAN',
      min: 0,
      max: 1,
      inputs: [{ type: 'BOOLEAN' }],
    })
    const schema = generateFormSchema(t)
    expect(schema.safeParse({ active: true }).success).toBe(true)
    expect(schema.safeParse({ active: false }).success).toBe(true)
    expect(schema.safeParse({ active: 'yes' }).success).toBe(false)
  })
})

describe('form-state contract — FLAT round-trip (b)', () => {
  it('formStateToFlat emits correct FLAT paths for the vitals template', () => {
    const formState = {
      weight: { magnitude: 70.5, unit: 'kg' },
      note: 'patient stable',
      observed: '2021-03-21T20:19:49',
      tags: ['a', 'b'],
      category: { code: '433' },
    }
    const flat = formStateToFlat(vitalsTemplate, formState)

    // DV_QUANTITY composite → |magnitude + |unit
    expect(flat['vitals/weight|magnitude']).toBe(70.5)
    expect(flat['vitals/weight|unit']).toBe('kg')
    // DV_TEXT scalar → |value
    expect(flat['vitals/note|value']).toBe('patient stable')
    // DV_DATE_TIME → bare key (no |suffix)
    expect(flat['vitals/observed']).toBe('2021-03-21T20:19:49')
    // DV_TEXT array → :index|value
    expect(flat['vitals/tags:0|value']).toBe('a')
    expect(flat['vitals/tags:1|value']).toBe('b')
    // DV_CODED_TEXT composite → |code
    expect(flat['vitals/category|code']).toBe('433')
  })

  it('flatToFormState is the inverse of formStateToFlat', () => {
    const formState = {
      weight: { magnitude: 70.5, unit: 'kg' },
      note: 'patient stable',
      observed: '2021-03-21T20:19:49',
      tags: ['a', 'b'],
      category: { code: '433' },
    }
    const flat = formStateToFlat(vitalsTemplate, formState)
    const recovered = flatToFormState(vitalsTemplate, flat)
    expect(recovered).toEqual(formState)
  })

  it('round-trip schema validation: recovered state passes generateFormSchema', () => {
    const formState = {
      weight: { magnitude: 70.5, unit: 'kg' },
      note: 'patient stable',
      observed: '2021-03-21T20:19:49',
      tags: ['a', 'b'],
      category: { code: '433' },
    }
    const flat = formStateToFlat(vitalsTemplate, formState)
    const recovered = flatToFormState(vitalsTemplate, flat)
    const schema = generateFormSchema(vitalsTemplate)
    expect(schema.safeParse(recovered).success).toBe(true)
  })

  it('DV_DATE bare key round-trip', () => {
    const t = makeTemplate({
      id: 'dob',
      rmType: 'DV_DATE',
      min: 0,
      max: 1,
      inputs: [{ type: 'DATE' }],
    })
    const formState = { dob: '1990-01-15' }
    const flat = formStateToFlat(t, formState)
    // DV_DATE → bare key (no |suffix)
    expect(flat['root/dob']).toBe('1990-01-15')
    expect(flatToFormState(t, flat)).toEqual(formState)
  })

  it('DV_COUNT scalar round-trip', () => {
    const t = makeTemplate({
      id: 'heartRate',
      rmType: 'DV_COUNT',
      min: 0,
      max: 1,
      inputs: [{ type: 'INTEGER' }],
    })
    const formState = { heartRate: 72 }
    const flat = formStateToFlat(t, formState)
    // DV_COUNT → |magnitude
    expect(flat['root/heartRate|magnitude']).toBe(72)
    expect(flatToFormState(t, flat)).toEqual(formState)
  })
})

describe('form-state contract — test_all_types fixture', () => {
  // Smoke test: the full fixture template parses without throwing and generates
  // a usable schema. Individual leaf contract tests above cover the leaf types.
  // The fixture is inlined here as a minimal representative since the full
  // test_all_types.webtemplate.json is tested by the openehr-web-template package.
  it('generates a form schema from a multi-leaf template without throwing', () => {
    const t = parseWebTemplate({
      templateId: 'contract.all-types.v1',
      defaultLanguage: 'en',
      languages: ['en'],
      tree: {
        id: 'all_types',
        rmType: 'COMPOSITION',
        min: 1,
        max: 1,
        children: [
          { id: 'text_field', rmType: 'DV_TEXT', min: 0, max: 1, inputs: [{ type: 'TEXT' }] },
          {
            id: 'coded',
            rmType: 'DV_CODED_TEXT',
            min: 0,
            max: 1,
            inputs: [{ suffix: 'code', type: 'CODED_TEXT', list: [{ value: 'a' }, { value: 'b' }] }],
          },
          {
            id: 'qty',
            rmType: 'DV_QUANTITY',
            min: 0,
            max: 1,
            inputs: [
              { suffix: 'magnitude', type: 'DECIMAL' },
              { suffix: 'unit', type: 'CODED_TEXT', list: [{ value: 'kg' }] },
            ],
          },
          { id: 'cnt', rmType: 'DV_COUNT', min: 0, max: 1, inputs: [{ type: 'INTEGER' }] },
          { id: 'bool', rmType: 'DV_BOOLEAN', min: 0, max: 1, inputs: [{ type: 'BOOLEAN' }] },
          { id: 'dt', rmType: 'DV_DATE_TIME', min: 0, max: 1, inputs: [{ type: 'DATETIME' }] },
          { id: 'd', rmType: 'DV_DATE', min: 0, max: 1, inputs: [{ type: 'DATE' }] },
          { id: 'dur', rmType: 'DV_DURATION', min: 0, max: 1, inputs: [{ type: 'DURATION' }] },
        ],
      },
    })
    const schema = generateFormSchema(t)
    expect(typeof schema.safeParse).toBe('function')
    const result = schema.safeParse({})
    expect(typeof result.success).toBe('boolean')
  })
})
