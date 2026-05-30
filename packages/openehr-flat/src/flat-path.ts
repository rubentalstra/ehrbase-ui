// FLAT (simSDT) path grammar.
//
// A FLAT key is a `/`-delimited path of node ids, each optionally carrying a
// `:index` for array cardinality, terminated by an optional `|attribute` for the
// leaf primitive (magnitude, unit, code, value, terminology, …). Examples:
//
//   ehrn_vital_signs.v2/vital_signs:0/blood_pressure:0/any_event:0/systolic|magnitude
//   ehrn_vital_signs.v2/context/start_time            (no attribute — a bare leaf)
//   ehrn_vital_signs.v2/composer|name

export interface FlatSegment {
  id: string;
  /** array index when the node is multiply-occurring (`id:index`). */
  index?: number;
}

export interface ParsedFlatPath {
  segments: FlatSegment[];
  /** the `|attribute` suffix, if present. */
  attribute?: string;
}

const INDEXED = /^(.*):(\d+)$/;

/** Parse a FLAT key into its path segments + optional leaf attribute. */
export function parseFlatPath(key: string): ParsedFlatPath {
  const pipe = key.indexOf("|");
  const pathPart = pipe >= 0 ? key.slice(0, pipe) : key;
  const attribute = pipe >= 0 ? key.slice(pipe + 1) : undefined;
  const segments = pathPart
    .split("/")
    .filter((s) => s.length > 0)
    .map((seg): FlatSegment => {
      const m = INDEXED.exec(seg);
      if (m && m[1] !== undefined && m[2] !== undefined) {
        return { id: m[1], index: Number(m[2]) };
      }
      return { id: seg };
    });
  return attribute === undefined ? { segments } : { segments, attribute };
}

/** Build a FLAT key from segments + optional leaf attribute (inverse of parseFlatPath). */
export function buildFlatPath(segments: FlatSegment[], attribute?: string): string {
  const path = segments
    .map((s) => (s.index === undefined ? s.id : `${s.id}:${s.index}`))
    .join("/");
  return attribute === undefined ? path : `${path}|${attribute}`;
}
