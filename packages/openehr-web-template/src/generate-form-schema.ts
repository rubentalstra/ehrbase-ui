// Generate a Zod schema for FORM STATE from a parsed web template (the §7 form
// pipeline). The web template's own structure drives the schema: each leaf
// node's `inputs` map to Zod field(s), constraint `validation` becomes Zod
// refinements, and `min`/`max` cardinality wraps fields as required / optional /
// arrays.
//
// The form schema is a finite nested object keyed by node `id`, so it is built
// eagerly by recursion — no z.lazy/getter needed (web templates are acyclic).
//
// Unmapped rmTypes produce a clearly-marked UNSUPPORTED_SCHEMA sentinel rather
// than z.unknown(). The sentinel fails safeParse so the value is excluded from
// writable form-state (silent mis-encoding is impossible). A dev-mode console
// warning is emitted once per rmType. See `UNSUPPORTED_SCHEMA` below.

import { z } from "zod";

import type { WebTemplate, WebTemplateInput, WebTemplateNode } from "./web-template.ts";

// ── Unsupported-type sentinel ─────────────────────────────────────────────────

/**
 * Marker schema returned when an rmType has no mapping in this generator.
 * It always fails safeParse so un-mapped values can never reach the FLAT
 * converter. The schema carries a `_unsupportedRmType` brand for introspection.
 */
export interface UnsupportedSchema {
  readonly _unsupportedRmType: string;
  readonly schema: z.ZodTypeAny;
}

const _warned = new Set<string>();

// Emit a dev warning without requiring a DOM/Node lib in tsconfig. `console` is
// not in this package's lib set, so declare it ambiently (type-only; erased at
// compile — at runtime it resolves to the real global, present in browser+Node).
declare const console: { warn(...args: unknown[]): void } | undefined;

function devWarn(message: string): void {
  console?.warn?.(message);
}

function unsupportedSchema(rmType: string): z.ZodTypeAny {
  if (!_warned.has(rmType)) {
    _warned.add(rmType);
    devWarn(
      `[openehr-form] Unmapped rmType "${rmType}" — value excluded from form state. ` +
        `Open an ADR to propose the mapping (see docs/architecture.md §7).`,
    );
  }
  // A z.never() schema always fails parse and carries no unknown data through.
  return z.never();
}

// ── Input type → Zod mapping ─────────────────────────────────────────────────

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
      // Unknown input primitive — fall back to z.string() (inputs are always
      // typed by EHRbase; this branch only fires if a future EHRbase adds a
      // new primitive type). The rmType-level unsupported guard above fires for
      // truly unknown rmTypes.
      schema = z.string();
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

// ── rmType-specific leaf schema overrides ────────────────────────────────────
//
// Several rmTypes need special handling that the generic inputs-based path cannot
// provide because the renderer's form-state shape diverges from the template's
// raw input list. These overrides are checked before the generic composite/scalar
// logic.

/**
 * DV_ORDINAL — the template presents a single suffix-less CODED_TEXT input
 * (the ordinal code). The renderer stores the selected code as a scalar string.
 * Zod: z.string() or z.enum(codes) when the list is closed.
 */
function dvOrdinalSchema(node: WebTemplateNode): z.ZodTypeAny {
  const inp = node.inputs?.[0];
  const values = (inp?.list ?? []).map((item) => item.value);
  if (values.length > 0 && !inp?.listOpen) {
    return z.enum(values);
  }
  return z.string();
}

/**
 * DV_DURATION — the renderer collects an ISO 8601 duration string from the
 * clinician (e.g. "P1Y2M3DT4H5M6S"), regardless of whether the template
 * exposes individual year/month/day/… inputs. This keeps the form-state simple
 * and the FLAT encoding consistent (bare key, no |suffix).
 */
function dvDurationSchema(): z.ZodTypeAny {
  return z.string();
}

/**
 * DV_MULTIMEDIA — the renderer captures a File descriptor object
 * `{ name: string, size: number, type: string }` from the browser file picker.
 * The actual binary is handled server-side (§7.x upload pipeline). The FLAT
 * converter emits this composite as `|name`, `|size`, and `|mediatype`.
 */
function dvMultimediaSchema(): z.ZodTypeAny {
  return z.object({
    name: z.string(),
    size: z.number().int(),
    type: z.string(),
  });
}

/**
 * DV_PARSABLE — composite leaf with `value` (the parsable text) and `formalism`
 * (the formalism string, e.g. "text/plain"). Both are strings. Already handled
 * by the generic composite path when the template has the correct suffix inputs,
 * but we make the schema explicit for safety.
 */
function dvParsableSchema(node: WebTemplateNode): z.ZodTypeAny {
  const inputs = node.inputs ?? [];
  if (inputs.length > 0 && inputs.some((i) => i.suffix)) {
    // Generic composite path covers this case (iterates suffix inputs).
    return leafSchema(node);
  }
  // Fallback: bare value+formalism object.
  return z.object({ value: z.string(), formalism: z.string() });
}

/**
 * DV_IDENTIFIER — composite leaf with four text sub-fields:
 * `id`, `type`, `issuer`, `assigner`. The template exposes these as suffix
 * inputs (TEXT). The generic composite path handles this, but we guard it
 * explicitly to document the shape.
 */
function dvIdentifierSchema(node: WebTemplateNode): z.ZodTypeAny {
  const inputs = node.inputs ?? [];
  if (inputs.length > 0 && inputs.some((i) => i.suffix)) {
    return leafSchema(node);
  }
  return z.object({
    id: z.string().optional(),
    type: z.string().optional(),
    issuer: z.string().optional(),
    assigner: z.string().optional(),
  });
}

/**
 * DV_PROPORTION — composite leaf with `numerator` and `denominator` (both
 * numbers). The template exposes these as DECIMAL suffix inputs. The generic
 * composite path handles this correctly; guard makes the mapping explicit.
 */
function dvProportionSchema(node: WebTemplateNode): z.ZodTypeAny {
  const inputs = node.inputs ?? [];
  if (inputs.length > 0 && inputs.some((i) => i.suffix)) {
    return leafSchema(node);
  }
  return z.object({ numerator: z.number(), denominator: z.number() });
}

/**
 * DV_CODED_TEXT — same suffix-driven composite/scalar shape as the generic path,
 * but for an EXTERNAL binding (a `code` suffix whose terminology is not `local`/
 * `openehr` and which has no closed in-template list) the live combobox writes a
 * `{ code, value, terminology }` object (so the FLAT converter can emit `|code`,
 * `|value`, `|terminology`). This override ADDS an optional `terminology` key to
 * the composite so that object survives form-state validation — purely additive,
 * the closed-list `{ code: enum }` case is unchanged (terminology is optional).
 */
function dvCodedTextSchema(node: WebTemplateNode): z.ZodTypeAny {
  const base = leafSchema(node);
  // Only composite leaves (keyed by suffix) carry a `terminology` companion key;
  // a scalar (single suffix-less input) coded text stays a bare string.
  if (base instanceof z.ZodObject) {
    return base.extend({ terminology: z.string().optional() });
  }
  return base;
}

// ── Generic leaf schema (suffix-driven composite or scalar) ──────────────────

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

// ── Cardinality wrapper ───────────────────────────────────────────────────────

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

// ── Recursive node schema ─────────────────────────────────────────────────────

/** Recursively build the form schema for a node. */
function nodeSchema(node: WebTemplateNode): z.ZodTypeAny {
  if (node.inputs && node.inputs.length > 0) {
    return rmTypeLeafSchema(node);
  }
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
 * Dispatch to the correct leaf schema builder for a node based on its rmType.
 *
 * The priority order is:
 *   1. rmType-specific overrides (where the renderer shape differs from the
 *      raw template inputs).
 *   2. Generic composite / scalar path (driven by the node's `inputs` list).
 *   3. Unmapped rmType → z.never() sentinel with a dev warning.
 */
function rmTypeLeafSchema(node: WebTemplateNode): z.ZodTypeAny {
  switch (node.rmType) {
    // ── Types with explicit form-state overrides ────────────────────────────
    case "DV_ORDINAL":
      return dvOrdinalSchema(node);
    case "DV_DURATION":
      return dvDurationSchema();
    case "DV_MULTIMEDIA":
      return dvMultimediaSchema();
    case "DV_PARSABLE":
      return dvParsableSchema(node);
    case "DV_IDENTIFIER":
      return dvIdentifierSchema(node);
    case "DV_PROPORTION":
      return dvProportionSchema(node);
    case "DV_CODED_TEXT":
      return dvCodedTextSchema(node);

    // ── Generic inputs-based path (incl. context / structural types
    //    PARTY_PROXY, PARTY_IDENTIFIED, STRING that carry inputs) ────────────
    case "DV_TEXT":
    case "DV_QUANTITY":
    case "DV_COUNT":
    case "DV_BOOLEAN":
    case "DV_DATE":
    case "DV_DATE_TIME":
    case "DV_TIME":
    case "DV_URI":
    case "DV_EHR_URI":
    case "PARTY_PROXY":
    case "PARTY_IDENTIFIED":
    case "STRING":
      return leafSchema(node);

    // ── Unmapped rmType: visible-safe fail-fast ─────────────────────────────
    default:
      return unsupportedSchema(node.rmType);
  }
}

/**
 * Generate a Zod schema validating the form state for a web template. The root
 * is the template's COMPOSITION; the result is a nested object keyed by node id.
 */
export function generateFormSchema(template: WebTemplate): z.ZodTypeAny {
  return nodeSchema(template.tree);
}
