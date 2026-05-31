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
//     bare (no `|`), e.g. `…/start_time`;
//   - DV_ORDINAL scalar → `|code` (the ordinal code, not `|value`);
//   - DV_MULTIMEDIA file-descriptor → composite `|name`, `|size`, `|mediatype`.
//
// F3 additions (§7 library-completeness):
//   - null_flavour round-trip: an ELEMENT that has no value but carries a
//     null_flavour is represented in form-state as `{ _null_flavour: "<code>" }`
//     (optionally `_null_flavour_value` and `_null_flavour_terminology`).
//     FLAT key convention (EHRbase simSDT):
//       `<path>/_null_flavour|code`, `…/_null_flavour|value`, `…/_null_flavour|terminology`
//     On encode: when `_null_flavour` is present on a leaf form-state, emit the
//     `_null_flavour` keys and skip the value keys.
//     On decode: when `_`-prefixed null_flavour FLAT keys are present, recover
//     the `{ _null_flavour, _null_flavour_value?, _null_flavour_terminology? }` shape.
//   - normal_range read-round-trip: DV_QUANTITY / DV_COUNT / DV_ORDINAL may
//     carry `_normal_range` in FLAT (EHRbase emits it alongside the value keys).
//     FLAT key convention:
//       `<path>/_normal_range/lower|magnitude`, `…/_normal_range/lower|unit`,
//       `<path>/_normal_range/upper|magnitude`, `…/_normal_range/upper|unit`,
//       `<path>/_normal_range/lower_unbounded`, `<path>/_normal_range/upper_unbounded`,
//       `<path>/_normal_range/lower_included`, `<path>/_normal_range/upper_included`
//     On decode: recover `{ …valueKeys, _normal_range: { lower, upper, … } }`.
//     Writing ranges from the form is not supported (ranges come from CDR/template).
//     Form-state key `_normal_range` is preserved as-is through formStateToFlat
//     so a read → edit → write cycle does not lose the range metadata (pass-through).

import type { WebTemplate, WebTemplateNode } from "@ehrbase-ui/openehr-web-template";

import { buildFlatPath, parseFlatPath, type FlatSegment } from "./flat-path.ts";

export type FlatComposition = Record<string, unknown>;

// Scalar leaf rmType → its single FLAT `|suffix`; `null` means a bare key.
//
// Evidence from the openEHR_SDK vitalsigns FLAT fixture (see
// src/__tests__/fixtures/vitalsigns.flat.json):
//   - DV_DATE_TIME: "…/context/start_time" (bare, no |suffix) → null
//   - DV_QUANTITY:  "…/systolic|magnitude" + "…/systolic|unit" → composite (not scalar)
//   - DV_CODED_TEXT: "…/setting|code", "|value", "|terminology" → composite
//   - DV_TEXT:      handled via composite path (suffix inputs present in template)
//                   or scalar → "|value"
//
// DV_ORDINAL: the ordinal value is the selected code; EHRbase FLAT uses `|code`.
// DV_DURATION: bare key (ISO 8601 string, e.g. "P1Y2M3DT4H5M6S").
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
  // DV_ORDINAL: the single suffix-less input encodes the ordinal code.
  DV_ORDINAL: "code",
};

// DV_MULTIMEDIA: the renderer captures { name, size, type } from the file picker.
// FLAT encoding maps these to |name, |size, |mediatype respectively.
const MULTIMEDIA_FLAT_KEYS: Record<string, string> = {
  name: "name",
  size: "size",
  type: "mediatype",
};

// rmTypes whose form-state is always a scalar (regardless of template input
// structure). DV_DURATION's template has composite year/month/… inputs but the
// renderer produces a single ISO 8601 string, so it must be treated as scalar.
const SCALAR_OVERRIDE_RM_TYPES = new Set(["DV_DURATION"]);

// ── Internal key constants ─────────────────────────────────────────────────────
//
// F3: `_null_flavour` and `_normal_range` are RM-level attribute names that
// EHRbase maps to FLAT keys using the `_`-prefixed path-segment convention.
// The FLAT key uses an underscore-prefixed segment: `…/_null_flavour|code`.
// In form-state these are stored under the same `_`-prefixed keys so the
// shape is self-describing.
const NULL_FLAVOUR_SEGMENT = "_null_flavour";
const NORMAL_RANGE_SEGMENT = "_normal_range";

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
function isLeaf(node: WebTemplateNode): boolean {
  return (node.inputs?.length ?? 0) > 0;
}
function isScalarLeaf(node: WebTemplateNode): boolean {
  if (SCALAR_OVERRIDE_RM_TYPES.has(node.rmType)) return true;
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
function isMultimediaNode(node: WebTemplateNode): boolean {
  return node.rmType === "DV_MULTIMEDIA";
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
  // F3 null-flavour: when the form-state carries `_null_flavour`, emit the
  // `_null_flavour|code` (and optionally `|value`, `|terminology`) FLAT keys
  // and skip the value keys.  A null-flavoured element has no data value.
  if (isRecord(value) && typeof value[NULL_FLAVOUR_SEGMENT] === "string") {
    const nfCode = value[NULL_FLAVOUR_SEGMENT];
    const nfSegments = [...segments, { id: NULL_FLAVOUR_SEGMENT }];
    out[buildFlatPath(nfSegments, "code")] = nfCode;
    const nfValue = value["_null_flavour_value"];
    if (typeof nfValue === "string") out[buildFlatPath(nfSegments, "value")] = nfValue;
    const nfTerminology = value["_null_flavour_terminology"];
    if (typeof nfTerminology === "string") out[buildFlatPath(nfSegments, "terminology")] = nfTerminology;
    return;
  }

  // DV_MULTIMEDIA: file descriptor { name, size, type } → |name, |size, |mediatype
  if (isMultimediaNode(node) && isRecord(value)) {
    for (const [descriptorKey, flatSuffix] of Object.entries(MULTIMEDIA_FLAT_KEYS)) {
      const attrValue = value[descriptorKey];
      if (attrValue !== undefined && attrValue !== null) {
        out[buildFlatPath(segments, flatSuffix)] = attrValue;
      }
    }
    return;
  }

  if (isScalarLeaf(node)) {
    const suffix = scalarSuffix(node.rmType);
    out[buildFlatPath(segments, suffix ?? undefined)] = value;
    return;
  }
  if (isRecord(value)) {
    for (const [attribute, attrValue] of Object.entries(value)) {
      if (attrValue !== undefined && attrValue !== null) {
        // F3 normal_range pass-through: emit nested `_normal_range/…` FLAT keys
        // so a read → edit → write cycle preserves the range metadata.
        if (attribute === NORMAL_RANGE_SEGMENT && isRecord(attrValue)) {
          emitNormalRange(attrValue, segments, out);
          continue;
        }
        // Skip other `_`-prefixed metadata keys (e.g. `_null_flavour` is already
        // handled above; any other `_` key is RM-level and not a form value).
        if (attribute.startsWith("_")) continue;
        out[buildFlatPath(segments, attribute)] = attrValue;
      }
    }
    return;
  }
  out[buildFlatPath(segments, "value")] = value;
}

/**
 * Emit the `_normal_range` nested FLAT keys from a form-state normal_range
 * object.  EHRbase FLAT encodes range bounds as child paths:
 *   `<path>/_normal_range/lower|magnitude`, `…/_normal_range/lower|unit`,
 *   `<path>/_normal_range/upper|magnitude`, `…/_normal_range/upper|unit`,
 *   `<path>/_normal_range/lower_unbounded`, `<path>/_normal_range/upper_unbounded`,
 *   `<path>/_normal_range/lower_included`, `<path>/_normal_range/upper_included`
 */
function emitNormalRange(range: Record<string, unknown>, parentSegments: FlatSegment[], out: FlatComposition): void {
  const rangeSegments = [...parentSegments, { id: NORMAL_RANGE_SEGMENT }];
  // Emit boolean interval flags as bare (no |suffix) keys.
  for (const flag of ["lower_unbounded", "upper_unbounded", "lower_included", "upper_included"]) {
    const v = range[flag];
    if (typeof v === "boolean") {
      out[buildFlatPath(rangeSegments) + "/" + flag] = v;
    }
  }
  // Emit lower/upper composite DV_QUANTITY bounds.
  for (const bound of ["lower", "upper"]) {
    const boundVal = range[bound];
    if (isRecord(boundVal)) {
      const boundSegments = [...rangeSegments, { id: bound }];
      for (const [k, v] of Object.entries(boundVal)) {
        if (v !== undefined && v !== null && !k.startsWith("_")) {
          out[buildFlatPath(boundSegments, k)] = v;
        }
      }
    }
  }
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

    // F3: detect `_`-prefixed RM-attribute segments (null_flavour, normal_range).
    // Find the first `_`-prefixed segment — that marks the boundary between the
    // template path (segments before it) and the RM-attribute sub-path.
    const rmAttrIndex = pathSegments.findIndex((s) => s.id.startsWith("_"));
    if (rmAttrIndex >= 0) {
      // templatePath: the path to the template node that carries the RM attribute.
      const templatePath = pathSegments.slice(0, rmAttrIndex);
      // rmAttrPath: the `_`-prefixed sub-path (e.g. ["_null_flavour"] or ["_normal_range","lower"]).
      const rmAttrPath = pathSegments.slice(rmAttrIndex);

      if (templatePath.length === 0) continue; // no parent template node — skip

      const rmAttrSegId = rmAttrPath[0]?.id;
      if (rmAttrSegId === NULL_FLAVOUR_SEGMENT && attribute !== undefined) {
        // `_null_flavour|code` → { _null_flavour: code }
        // `_null_flavour|value` → { _null_flavour_value: value }
        // `_null_flavour|terminology` → { _null_flavour_terminology: terminology }
        const formKey =
          attribute === "code"
            ? NULL_FLAVOUR_SEGMENT
            : attribute === "value"
              ? "_null_flavour_value"
              : attribute === "terminology"
                ? "_null_flavour_terminology"
                : undefined;
        if (formKey !== undefined) {
          setNested(root, templatePath, formKey, false, value);
        }
        continue;
      }

      if (rmAttrSegId === NORMAL_RANGE_SEGMENT) {
        // `_normal_range/lower|magnitude` etc. → form-state `_normal_range.lower.magnitude`
        // Only attach _normal_range to COMPOSITE leaves (DV_QUANTITY etc.) whose
        // form-state is a record object.  Scalar leaves (DV_COUNT, DV_TEXT, …)
        // carry a plain scalar value that cannot hold metadata — skip silently.
        const templateNode = resolveNode(template.tree, templatePath);
        if (templateNode && isScalarLeaf(templateNode)) continue; // scalar — skip
        setNestedNormalRange(root, templatePath, rmAttrPath.slice(1), attribute, value);
        continue;
      }

      // Other `_`-prefixed RM attributes: skip silently (not part of form-state).
      continue;
    }

    const node = resolveNode(template.tree, pathSegments);

    // DV_MULTIMEDIA: FLAT |name/|size/|mediatype keys → rebuild descriptor object.
    if (node?.rmType === "DV_MULTIMEDIA" && attribute !== undefined) {
      const reversedKey = multimediaFlatToDescriptorKey(attribute);
      if (reversedKey !== undefined) {
        setNested(root, pathSegments, reversedKey, false, value);
        continue;
      }
    }

    const scalar = node ? isScalarLeaf(node) : attribute === undefined;
    setNested(root, pathSegments, attribute, scalar, value);
  }
  return root;
}

/**
 * Write a `_normal_range` sub-value into the form-state.  The `_normal_range`
 * object is nested under the template-node's form-state object.
 *
 * subPath: the segments AFTER `_normal_range` (e.g. `[{ id: "lower" }]` for
 *   `_normal_range/lower|magnitude`), or empty for bare interval flags like
 *   `_normal_range/lower_unbounded` (which are encoded as `attribute`-less
 *   paths in the FLAT grammar).
 *
 * EHRbase encodes the boolean DV_INTERVAL flags as bare paths (no `|`):
 *   `<leaf>/_normal_range/lower_unbounded` → attribute=undefined, no sub-path
 * It encodes the bound values as composite:
 *   `<leaf>/_normal_range/lower|magnitude` → subPath=[{id:"lower"}], attribute="magnitude"
 *
 * IMPORTANT: EHRbase actually emits the interval flags as path segments inside
 * `_normal_range`, not as FLAT leaf attributes.  The FLAT key looks like:
 *   `<leaf>/_normal_range/lower_unbounded`  (bare — parsed as a segment with no |suffix)
 * So `subPath` will have length 1 with id="lower_unbounded" and attribute=undefined.
 */
function setNestedNormalRange(
  root: Record<string, unknown>,
  templatePath: FlatSegment[],
  subPath: FlatSegment[],
  attribute: string | undefined,
  value: unknown,
): void {
  // Navigate to the template-node's form-state object.
  let current = root;
  for (let i = 0; i < templatePath.length; i++) {
    const seg = templatePath[i];
    if (!seg) return;
    const last = i === templatePath.length - 1;
    if (!last) {
      current =
        seg.index === undefined
          ? recordProp(current, seg.id)
          : recordAt(arrayProp(current, seg.id), seg.index);
      continue;
    }
    // At the leaf template-node, ensure it's a record (composite form-state).
    if (seg.index === undefined) {
      const existing = current[seg.id];
      if (!isRecord(existing)) {
        current[seg.id] = {};
      }
      const ensured = current[seg.id];
      if (!isRecord(ensured)) return; // guard: should be unreachable after setting {}
      current = ensured;
    } else {
      current = recordAt(arrayProp(current, seg.id), seg.index);
    }
  }

  // Ensure `_normal_range` sub-object exists.
  const rangeObj = recordProp(current, NORMAL_RANGE_SEGMENT);

  if (subPath.length === 0) {
    // Bare flag with no attribute — should not happen per the encoding, but
    // guard gracefully.
    return;
  }

  const firstSeg = subPath[0];
  if (!firstSeg) return;

  if (subPath.length === 1 && attribute === undefined) {
    // e.g. `_normal_range/lower_unbounded` — bare flag as a path segment.
    rangeObj[firstSeg.id] = value;
    return;
  }

  if (subPath.length === 1 && attribute !== undefined) {
    // e.g. `_normal_range/lower|magnitude` — composite bound attribute.
    const boundObj = recordProp(rangeObj, firstSeg.id);
    boundObj[attribute] = value;
    return;
  }

  // Deeper nesting (not expected in standard EHRbase output, but handle
  // gracefully by writing into a nested record).
  let rangeCtx = rangeObj;
  for (let i = 0; i < subPath.length; i++) {
    const seg = subPath[i];
    if (!seg) return;
    const last = i === subPath.length - 1;
    if (!last) {
      rangeCtx = recordProp(rangeCtx, seg.id);
    } else if (attribute !== undefined) {
      const target = recordProp(rangeCtx, seg.id);
      target[attribute] = value;
    } else {
      rangeCtx[seg.id] = value;
    }
  }
}

/**
 * Reverse-map a DV_MULTIMEDIA FLAT suffix to the descriptor object key.
 * FLAT suffix "name" → "name", "size" → "size", "mediatype" → "type".
 */
function multimediaFlatToDescriptorKey(flatSuffix: string): string | undefined {
  for (const [descriptorKey, suffix] of Object.entries(MULTIMEDIA_FLAT_KEYS)) {
    if (suffix === flatSuffix) return descriptorKey;
  }
  return undefined;
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
