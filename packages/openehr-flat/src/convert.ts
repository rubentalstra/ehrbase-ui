// Bidirectional converter between FORM STATE (the nested object the
// web-template form schema validates) and the EHRbase FLAT (simSDT) key/value
// map that is POSTed to / read from `…/composition?format=FLAT`.
//
// The conversion is web-template-aware: the template tells us, at each node,
// whether it is a container (descend with `/`), a leaf (emit `|attribute`s), and
// whether it is multiply-occurring (`:index`). Leaf encoding follows the FLAT
// convention verified against the openEHR_SDK simSDT fixtures:
//   - composite leaves (DV_QUANTITY → {magnitude, unit}, DV_CODED_TEXT → {code,
//     value, terminology}) emit one `|suffix` per present attribute;
//   - scalar leaves emit a single `|suffix` (DV_TEXT→value, DV_COUNT→magnitude,
//     DV_BOOLEAN→value, DV_URI→value) — except date/time/duration, which are
//     bare (no `|`), e.g. `…/start_time`.
//
// Scope: the common form-producible leaf types + arrays + context. Exotic FLAT
// constructs (reference ranges, `_`-prefixed RM attributes, null-flavour) are
// not emitted by the form engine and are out of scope here (a future revision
// fed by live-EHRbase round-trips can widen coverage).

import type { WebTemplate, WebTemplateNode } from "@ehrbase-ui/openehr-web-template";

import { buildFlatPath, parseFlatPath, type FlatSegment } from "./flat-path.ts";

export type FlatComposition = Record<string, unknown>;

// Scalar leaf rmType → its single FLAT `|suffix`; `null` means a bare key.
const FLAT_SCALAR_SUFFIX: Record<string, string | null> = {
  DV_TEXT: "value",
  DV_COUNT: "magnitude",
  DV_BOOLEAN: "value",
  DV_URI: "value",
  DV_EHR_URI: "value",
  DV_DATE: null,
  DV_DATE_TIME: null,
  DV_TIME: null,
  DV_DURATION: null,
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
function isLeaf(node: WebTemplateNode): boolean {
  return (node.inputs?.length ?? 0) > 0;
}
function isScalarLeaf(node: WebTemplateNode): boolean {
  const inputs = node.inputs ?? [];
  return inputs.length === 1 && !inputs[0]?.suffix;
}
function scalarSuffix(rmType: string): string | null {
  const suffix = FLAT_SCALAR_SUFFIX[rmType];
  return suffix === undefined ? "value" : suffix;
}
function isMulti(node: WebTemplateNode): boolean {
  return node.max === -1 || (node.max ?? 1) > 1;
}

// ── form state → FLAT ─────────────────────────────────────────────────────────

/** Convert form state to a FLAT composition map, rooted at the template id. */
export function formStateToFlat(template: WebTemplate, formState: unknown): FlatComposition {
  const out: FlatComposition = {};
  emitNode(template.tree, formState, [{ id: template.tree.id }], out);
  return out;
}

function emitNode(node: WebTemplateNode, value: unknown, segments: FlatSegment[], out: FlatComposition): void {
  if (value === undefined || value === null) return;
  if (isLeaf(node)) {
    emitLeaf(node, value, segments, out);
    return;
  }
  if (!isRecord(value)) return;
  for (const child of node.children ?? []) {
    const childValue = value[child.id];
    if (childValue === undefined || childValue === null) continue;
    if (isMulti(child) && Array.isArray(childValue)) {
      childValue.forEach((item, index) => emitNode(child, item, [...segments, { id: child.id, index }], out));
    } else {
      emitNode(child, childValue, [...segments, { id: child.id }], out);
    }
  }
}

function emitLeaf(node: WebTemplateNode, value: unknown, segments: FlatSegment[], out: FlatComposition): void {
  if (isScalarLeaf(node)) {
    const suffix = scalarSuffix(node.rmType);
    out[buildFlatPath(segments, suffix ?? undefined)] = value;
    return;
  }
  if (isRecord(value)) {
    for (const [attribute, attrValue] of Object.entries(value)) {
      if (attrValue !== undefined && attrValue !== null) {
        out[buildFlatPath(segments, attribute)] = attrValue;
      }
    }
    return;
  }
  out[buildFlatPath(segments, "value")] = value;
}

// ── FLAT → form state ─────────────────────────────────────────────────────────

/** Resolve the template node addressed by the (root-relative) path segments. */
function resolveNode(root: WebTemplateNode, pathSegments: FlatSegment[]): WebTemplateNode | undefined {
  let current: WebTemplateNode | undefined = root;
  for (const seg of pathSegments) {
    current = (current?.children ?? []).find((child) => child.id === seg.id);
    if (!current) return undefined;
  }
  return current;
}

function recordProp(obj: Record<string, unknown>, id: string): Record<string, unknown> {
  const existing = obj[id];
  if (isRecord(existing)) return existing;
  const fresh: Record<string, unknown> = {};
  obj[id] = fresh;
  return fresh;
}
function arrayProp(obj: Record<string, unknown>, id: string): unknown[] {
  const existing = obj[id];
  if (Array.isArray(existing)) return existing;
  const fresh: unknown[] = [];
  obj[id] = fresh;
  return fresh;
}
function recordAt(arr: unknown[], index: number): Record<string, unknown> {
  const existing = arr[index];
  if (isRecord(existing)) return existing;
  const fresh: Record<string, unknown> = {};
  arr[index] = fresh;
  return fresh;
}

/** Convert a FLAT composition map back to form state, using the template. */
export function flatToFormState(template: WebTemplate, flat: FlatComposition): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  const rootId = template.tree.id;
  for (const [key, value] of Object.entries(flat)) {
    const { segments, attribute } = parseFlatPath(key);
    if (segments.length === 0) continue;
    const pathSegments = segments[0]?.id === rootId ? segments.slice(1) : segments;
    if (pathSegments.length === 0) continue;
    const node = resolveNode(template.tree, pathSegments);
    const scalar = node ? isScalarLeaf(node) : attribute === undefined;
    setNested(root, pathSegments, attribute, scalar, value);
  }
  return root;
}

function setNested(
  root: Record<string, unknown>,
  pathSegments: FlatSegment[],
  attribute: string | undefined,
  scalar: boolean,
  value: unknown,
): void {
  let current = root;
  for (let i = 0; i < pathSegments.length; i++) {
    const seg = pathSegments[i];
    if (!seg) return;
    const last = i === pathSegments.length - 1;
    if (!last) {
      current = seg.index === undefined ? recordProp(current, seg.id) : recordAt(arrayProp(current, seg.id), seg.index);
      continue;
    }
    // leaf segment
    if (scalar) {
      if (seg.index === undefined) current[seg.id] = value;
      else arrayProp(current, seg.id)[seg.index] = value;
    } else if (attribute !== undefined) {
      const target = seg.index === undefined ? recordProp(current, seg.id) : recordAt(arrayProp(current, seg.id), seg.index);
      target[attribute] = value;
    }
  }
}
