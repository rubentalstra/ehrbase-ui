// Zod schemas for the EHRbase / Marand web template ("Simplified Data Template")
// JSON tree — the structure EHRbase returns from
// `GET /definition/template/adl1.4/{id}` with `Accept: application/json`.
//
// These PARSE input received from EHRbase, so they are deliberately permissive
// (`z.looseObject` keeps unmodelled fields rather than rejecting a valid
// template from a newer EHRbase). Field set verified against the openEHR_SDK
// `test_all_types` web template (Apache-2.0).

import { z } from "zod";

const LocalizedMap = z.record(z.string(), z.string());

// A selectable code in a CODED_TEXT / ORDINAL input.
export const WebTemplateListItem = z.looseObject({
  value: z.string(),
  label: z.string().optional(),
  localizedLabels: LocalizedMap.optional(),
  localizedDescriptions: LocalizedMap.optional(),
  ordinal: z.number().optional(),
});
export type WebTemplateListItem = z.infer<typeof WebTemplateListItem>;

// Constraint metadata on an input. `range.minOp`/`maxOp` are comparison
// operators (">=", ">", "<=", "<").
export const WebTemplateValidation = z.looseObject({
  range: z
    .looseObject({
      min: z.number().optional(),
      minOp: z.string().optional(),
      max: z.number().optional(),
      maxOp: z.string().optional(),
    })
    .optional(),
  precision: z.looseObject({ min: z.number().optional(), max: z.number().optional() }).optional(),
  pattern: z.string().optional(),
});
export type WebTemplateValidation = z.infer<typeof WebTemplateValidation>;

// A single primitive input of a leaf node. `type` is the simplified input type
// (TEXT, CODED_TEXT, DECIMAL, INTEGER, BOOLEAN, DATE, DATETIME, TIME, …).
// `suffix` names the FLAT attribute (magnitude, unit, code, …) for composite
// leaves; a single suffix-less input is a scalar value.
export const WebTemplateInput = z.looseObject({
  suffix: z.string().optional(),
  type: z.string(),
  list: z.array(WebTemplateListItem).optional(),
  listOpen: z.boolean().optional(),
  terminology: z.string().optional(),
  validation: WebTemplateValidation.optional(),
  defaultValue: z.unknown().optional(),
});
export type WebTemplateInput = z.infer<typeof WebTemplateInput>;

// A node in the web template tree. Recursive via a Zod-4 getter on `children`.
export const WebTemplateNode = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  localizedName: z.string().optional(),
  localizedNames: LocalizedMap.optional(),
  localizedDescriptions: LocalizedMap.optional(),
  rmType: z.string(),
  nodeId: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  aqlPath: z.string().optional(),
  inContext: z.boolean().optional(),
  inputs: z.array(WebTemplateInput).optional(),
  get children() {
    return z.array(WebTemplateNode).optional();
  },
});
export type WebTemplateNode = z.infer<typeof WebTemplateNode>;

// The top-level web template document.
export const WebTemplate = z.looseObject({
  templateId: z.string(),
  version: z.string().optional(),
  semVer: z.string().optional(),
  defaultLanguage: z.string().optional(),
  languages: z.array(z.string()).optional(),
  tree: WebTemplateNode,
});
export type WebTemplate = z.infer<typeof WebTemplate>;

/** Parse + validate an EHRbase web template JSON document. */
export function parseWebTemplate(input: unknown): WebTemplate {
  return WebTemplate.parse(input);
}
