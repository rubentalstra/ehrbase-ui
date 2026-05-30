// Generate a Zod schema for FORM STATE from a parsed web template (the §7 form
// pipeline). The web template's own structure drives the schema: each leaf
// node's `inputs` map to Zod field(s), constraint `validation` becomes Zod
// refinements, and `min`/`max` cardinality wraps fields as required / optional /
// arrays.
//
// The form schema is a finite nested object keyed by node `id`, so it is built
// eagerly by recursion — no z.lazy/getter needed (web templates are acyclic).

import { z } from "zod";

import type { WebTemplate, WebTemplateInput, WebTemplateNode } from "./web-template.ts";

/** Map one simplified input (+ its validation) to a Zod schema. */
function inputSchema(input: WebTemplateInput): z.ZodTypeAny {
  const values = (input.list ?? []).map((item) => item.value);
  let schema: z.ZodTypeAny;
  switch (input.type) {
    case "TEXT":
      schema = z.string();
      break;
    case "CODED_TEXT":
      schema = values.length > 0 && !input.listOpen ? z.enum(values) : z.string();
      break;
    case "DECIMAL":
      schema = applyRange(z.number(), input);
      break;
    case "INTEGER":
      schema = applyRange(z.number().int(), input);
      break;
    case "BOOLEAN":
      schema = z.boolean();
      break;
    case "DATE":
    case "DATETIME":
    case "TIME":
      // openEHR date/time values are ISO-8601 strings; the `pattern` is a
      // display mask ("yyyy-mm-dd"), not a regex, so we don't enforce it here.
      schema = z.string();
      break;
    default:
      schema = z.unknown();
  }
  return schema;
}

/** Apply a numeric `validation.range` (with comparison operators) to a number schema. */
function applyRange(schema: z.ZodNumber, input: WebTemplateInput): z.ZodNumber {
  const range = input.validation?.range;
  if (!range) return schema;
  let out = schema;
  if (typeof range.min === "number") out = range.minOp === ">" ? out.gt(range.min) : out.gte(range.min);
  if (typeof range.max === "number") out = range.maxOp === "<" ? out.lt(range.max) : out.lte(range.max);
  return out;
}

/** Build the value schema for a leaf node (a node carrying `inputs`). */
function leafSchema(node: WebTemplateNode): z.ZodTypeAny {
  const inputs = node.inputs ?? [];
  const only = inputs.length === 1 ? inputs[0] : undefined;
  if (only && !only.suffix) {
    return inputSchema(only);
  }
  // Composite leaf (e.g. DV_QUANTITY → { magnitude, unit }) keyed by suffix.
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const input of inputs) {
    if (input.suffix) shape[input.suffix] = inputSchema(input);
  }
  return z.object(shape);
}

/** Wrap a child's schema per its cardinality (`min`/`max`). */
function withCardinality(node: WebTemplateNode, schema: z.ZodTypeAny): z.ZodTypeAny {
  const min = node.min ?? 0;
  const max = node.max ?? 1;
  if (max === -1 || max > 1) {
    const arr = z.array(schema);
    return min > 0 ? arr.min(min) : arr.optional();
  }
  return min >= 1 ? schema : schema.optional();
}

/** Recursively build the form schema for a node. */
function nodeSchema(node: WebTemplateNode): z.ZodTypeAny {
  if (node.inputs && node.inputs.length > 0) return leafSchema(node);
  if (node.children && node.children.length > 0) {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const child of node.children) {
      shape[child.id] = withCardinality(child, nodeSchema(child));
    }
    return z.object(shape);
  }
  return z.unknown();
}

/**
 * Generate a Zod schema validating the form state for a web template. The root
 * is the template's COMPOSITION; the result is a nested object keyed by node id.
 */
export function generateFormSchema(template: WebTemplate): z.ZodTypeAny {
  return nodeSchema(template.tree);
}
