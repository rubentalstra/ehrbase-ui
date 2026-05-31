// Web-template-aware STRUCTURED (canonicalSDT) ↔ form-state converter.
//
// The STRUCTURED (canonicalSDT) format is the EHRbase JSON shape returned from
// `GET …/composition/{uid}?format=STRUCTURED` (Accept: application/json).
// It nests values as a JSON object tree, grouping all attributes for a single
// element under a key that matches the archetype node id.  Contrast with FLAT
// which flattens every attribute to a dotted `path|suffix` key.
//
// EHRbase 2.31 canonicalSDT shape (verified against the openEHR_SDK test
// fixtures, Apache-2.0):
//   { "<composition-id>": { "<section>": [ { "<element>": [ { "|magnitude": 70, "|unit": "kg" } ] } ] } }
//
// The `|`-prefixed attribute keys are the same as the FLAT suffixes; the
// difference is that STRUCTURED groups them in a per-element object inside an
// array.  Scalar leaves (DV_TEXT, DV_DATE_TIME, …) appear as a single-key
// object: `[ { "|value": "patient stable" } ]`.  Bare-key leaf types
// (DV_DATE_TIME, DV_DATE, DV_TIME, DV_DURATION) appear as `[ { "|value": "…" } ]`
// — EHRbase always wraps in the attribute key even for bare FLAT types.
//
// Strategy:
//   structuredToFormState — IMPLEMENTED (the read direction the viewer needs).
//   formStateToStructured — NOT IMPLEMENTED.  The writer direction is
//   significantly ambiguous because EHRbase STRUCTURED input requires extra
//   context attributes (_type, encoding, language, …) that the form engine
//   does not collect.  The FLAT format is the correct and verified writer path
//   (see composition.server.ts `formStateToFlat`).  A `formStateToStructured`
//   function is deferred; a follow-up ADR will propose it once live round-trip
//   tests validate the exact shape EHRbase 2.31 requires on write.
//
// Spec refs:
//   https://specifications.openehr.org/releases/ITS-REST/latest/simplified_data_template.html
//   EHRbase 2.31 OpenAPI — GET /ehr/{ehr_id}/composition/{uid_based_id}

import type { WebTemplate, WebTemplateNode } from "@ehrbase-ui/openehr-web-template";

// ── Type guards ───────────────────────────────────────────────────────────────

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isArray(x: unknown): x is unknown[] {
  return Array.isArray(x);
}

// ── F3: null_flavour + normal_range STRUCTURED → form-state ──────────────────
//
// In EHRbase STRUCTURED (canonicalSDT) format, RM-level attributes on an
// ELEMENT object use `_`-prefixed keys with `|attribute` suffix:
//   { "|value": ..., "_null_flavour|code": "253", "_null_flavour|value": "unknown",
//     "_null_flavour|terminology": "openehr" }
// and for normal_range on a composite leaf:
//   { "|magnitude": 5.4, "|unit": "mmol/L",
//     "_normal_range|lower|magnitude": 3.9, "_normal_range|lower|unit": "mmol/L", … }
//
// The `|` in `_null_flavour|code` is NOT a standard FLAT `|attribute` suffix —
// it is EHRbase's STRUCTURED encoding of the nested attribute.  Our form-state
// shape mirrors the FLAT convention:
//   { _null_flavour: "253", _null_flavour_value?: "unknown", … }
//   { magnitude: 5.4, unit: "mmol/L", _normal_range: { lower: { magnitude: 3.9, unit: "mmol/L" }, … } }

/**
 * Extract null-flavour form-state keys from a STRUCTURED element object.
 * Returns an object with `_null_flavour`, `_null_flavour_value?`, and
 * `_null_flavour_terminology?` when present; empty object otherwise.
 */
function extractNullFlavourFromStructured(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const code = obj["_null_flavour|code"];
  if (typeof code === "string") result["_null_flavour"] = code;
  const val = obj["_null_flavour|value"];
  if (typeof val === "string") result["_null_flavour_value"] = val;
  const term = obj["_null_flavour|terminology"];
  if (typeof term === "string") result["_null_flavour_terminology"] = term;
  return result;
}

/**
 * Extract normal_range form-state object from a STRUCTURED element object.
 * EHRbase encodes the range as flat keys in the element object:
 *   "_normal_range|lower|magnitude", "_normal_range|lower|unit",
 *   "_normal_range|upper|magnitude", "_normal_range|upper|unit",
 *   "_normal_range|lower_unbounded", "_normal_range|upper_unbounded",
 *   "_normal_range|lower_included", "_normal_range|upper_included"
 * Returns `undefined` when no `_normal_range` keys are found.
 */
function extractNormalRangeFromStructured(obj: Record<string, unknown>): Record<string, unknown> | undefined {
  const range: Record<string, unknown> = {};
  let found = false;

  for (const [k, v] of Object.entries(obj)) {
    if (!k.startsWith("_normal_range|")) continue;
    found = true;
    // Strip the "_normal_range|" prefix.
    const rest = k.slice("_normal_range|".length);
    // Split on "|" — for nested paths like "lower|magnitude".
    const parts = rest.split("|");
    if (parts.length === 1) {
      // Boolean flag: "lower_unbounded", "upper_unbounded", etc.
      const flag = parts[0];
      if (flag !== undefined) range[flag] = v;
    } else if (parts.length === 2) {
      // Bound attribute: "lower", "magnitude".
      const bound = parts[0];
      const attr = parts[1];
      if (bound !== undefined && attr !== undefined) {
        const boundObj = recordPropStructured(range, bound);
        boundObj[attr] = v;
      }
    }
  }

  return found ? range : undefined;
}

function recordPropStructured(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const existing = obj[key];
  if (isRecord(existing)) return existing;
  const fresh: Record<string, unknown> = {};
  obj[key] = fresh;
  return fresh;
}

// ── Leaf detection (mirrors convert.ts) ──────────────────────────────────────

function isLeafNode(node: WebTemplateNode): boolean {
  return (node.inputs?.length ?? 0) > 0;
}

function isScalarLeafNode(node: WebTemplateNode): boolean {
  const inputs = node.inputs ?? [];
  return inputs.length === 1 && !inputs[0]?.suffix;
}

function isMultiNode(node: WebTemplateNode): boolean {
  return node.max === -1 || (node.max ?? 1) > 1;
}

// ── Structured element → form-state value ────────────────────────────────────
//
// A STRUCTURED element is an array of objects.  Each object holds the
// attributes for one occurrence of the element (one array item for
// multiply-occurring nodes, exactly one item for singular nodes).
//
// The attribute keys are `|suffix` (e.g. "|magnitude", "|value") — the same
// attribute names as in FLAT, but here they are keys inside the element object.
//
// EHRbase also injects `_type` and sometimes `encoding`/`language`/`_name`
// into the element objects — those are RM-level administrative fields, not leaf
// data; we skip them (they start with `_` or are RM context names without `|`).

function elementObjectToLeafValue(
  obj: Record<string, unknown>,
  node: WebTemplateNode,
): unknown {
  // F3 null-flavour: detect `_null_flavour|code` in the STRUCTURED element object.
  // A null-flavoured element has no `|value` and the null_flavour keys are present.
  // The form-state shape for a null-flavoured leaf is:
  //   { _null_flavour: "<code>", _null_flavour_value?: "<rubric>", _null_flavour_terminology?: "<term>" }
  // This must be checked BEFORE the scalar/composite branch so that a
  // null-flavoured scalar leaf is not misread as its "|value" (absent → undefined).
  const hasNullFlavour = typeof obj["_null_flavour|code"] === "string";
  const hasValue = Object.keys(obj).some((k) => k.startsWith("|"));
  if (hasNullFlavour && !hasValue) {
    return extractNullFlavourFromStructured(obj);
  }

  if (isScalarLeafNode(node)) {
    // Scalar leaf: prefer "|value", fall back to any single `|`-prefixed key.
    // normal_range does not attach to scalar leaves (DV_TEXT, DV_DATE_TIME, etc.
    // are not orderable types that carry reference ranges in clinical practice).
    const direct = obj["|value"];
    if (direct !== undefined) return direct;
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith("|")) return v;
    }
    return undefined;
  }

  // Composite leaf (DV_QUANTITY, DV_CODED_TEXT, DV_PROPORTION, …): build the
  // form-state composite object from the `|suffix`-keyed attributes.
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith("|")) {
      const suffix = k.slice(1); // strip leading `|`
      result[suffix] = v;
    }
  }
  // F3 normal_range: attach as metadata on the composite form-state object.
  const range = extractNormalRangeFromStructured(obj);
  if (range !== undefined) {
    result["_normal_range"] = range;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

// ── Recursive STRUCTURED → form-state ────────────────────────────────────────

function structuredNodeToFormState(
  node: WebTemplateNode,
  structuredValue: unknown,
): unknown {
  if (structuredValue === undefined || structuredValue === null) return undefined;

  // Every STRUCTURED node value is wrapped in an array (cardinality wrapper).
  // For singular nodes this is a 1-element array; for multi-occurring nodes it
  // holds all occurrences.
  if (!isArray(structuredValue)) {
    // Unexpected shape — try to handle it gracefully as a bare object.
    if (isRecord(structuredValue)) {
      return structuredNodeToFormState(node, [structuredValue]);
    }
    return undefined;
  }

  if (isLeafNode(node)) {
    if (isMultiNode(node)) {
      // Each element of the outer array is one leaf occurrence.
      const items: unknown[] = [];
      for (const item of structuredValue) {
        if (isRecord(item)) {
          const val = elementObjectToLeafValue(item, node);
          if (val !== undefined) items.push(val);
        }
      }
      return items.length > 0 ? items : undefined;
    }
    // Singular leaf: take the first (and only) element.
    const first = structuredValue[0];
    if (!isRecord(first)) return undefined;
    return elementObjectToLeafValue(first, node);
  }

  // Container node: the array holds the occurrences of this container.
  if (isMultiNode(node)) {
    const items: unknown[] = [];
    for (const occurrence of structuredValue) {
      const formOccurrence = containerOccurrenceToFormState(node, occurrence);
      if (formOccurrence !== undefined) items.push(formOccurrence);
    }
    return items.length > 0 ? items : undefined;
  }

  // Singular container: one occurrence.
  const first = structuredValue[0];
  return containerOccurrenceToFormState(node, first);
}

function containerOccurrenceToFormState(
  node: WebTemplateNode,
  occurrence: unknown,
): Record<string, unknown> | undefined {
  if (!isRecord(occurrence)) return undefined;
  const result: Record<string, unknown> = {};

  for (const child of node.children ?? []) {
    const childStructured = occurrence[child.id];
    if (childStructured === undefined) continue;
    const childFormValue = structuredNodeToFormState(child, childStructured);
    if (childFormValue !== undefined) {
      result[child.id] = childFormValue;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Convert a STRUCTURED (canonicalSDT) composition document back to the
 * web-template form-state shape consumed by FieldRenderer and validated by
 * generateFormSchema(template).
 *
 * The STRUCTURED document is the body returned by
 * `GET …/composition/{uid}?format=STRUCTURED` (Accept: application/json).
 * Its top-level key is the composition template id (e.g. "vitals.v1").
 *
 * The returned form-state object is keyed by node id, matching exactly what
 * formStateToFlat and flatToFormState produce.  Pass it as defaultValues to
 * useForm to pre-populate the viewer form.
 *
 * formStateToStructured is NOT provided in this release — see file header for
 * rationale.  The FLAT path (formStateToFlat / composition.server.ts) is the
 * verified write path.
 */
export function structuredToFormState(
  template: WebTemplate,
  structured: unknown,
): Record<string, unknown> {
  if (!isRecord(structured)) return {};

  // The document is wrapped under the composition id (the tree root id or the
  // template id string — EHRbase uses the template id as the top-level key).
  const rootKey = template.tree.id;
  let rootValue: unknown = structured[rootKey];

  // Fallback: try the templateId if tree.id key is absent (some EHRbase
  // responses use the full templateId as the key).
  if (rootValue === undefined) {
    rootValue = structured[template.templateId];
  }

  if (rootValue === undefined) {
    // Try to find any top-level key that contains an array/object (the
    // composition body) rather than returning empty.
    for (const v of Object.values(structured)) {
      if (isRecord(v) || isArray(v)) {
        rootValue = v;
        break;
      }
    }
  }

  if (rootValue === undefined) return {};

  // The root COMPOSITION node in the web template is a container.  Its
  // children are the top-level sections / observations.  The STRUCTURED body
  // under the root key is either an object (singleton composition) or a
  // 1-element array containing that object.
  const rootObj: unknown = isArray(rootValue) ? rootValue[0] : rootValue;
  if (!isRecord(rootObj)) return {};

  const result: Record<string, unknown> = {};
  for (const child of template.tree.children ?? []) {
    const childStructured = rootObj[child.id];
    if (childStructured === undefined) continue;
    const childFormValue = structuredNodeToFormState(child, childStructured);
    if (childFormValue !== undefined) {
      result[child.id] = childFormValue;
    }
  }
  return result;
}
