// AQL 1.1.0 abstract syntax tree.
//
// A typed model of an Archetype Query Language statement — SELECT / FROM (with
// CONTAINS, incl. VERSION containment) / WHERE / ORDER BY / LIMIT — sufficient
// to express the project's stored-query catalogue and to round-trip with the
// hand-written parser (parse.ts) and serializer (serialize.ts).
//
// Symmetry rule: every shape the serializer emits, the parser reads back, and
// vice versa. Keep ast.ts / builder.ts / serialize.ts / parse.ts in lock-step.

/** A literal, a `$name` runtime parameter, or a function-call expression. */
export type AqlValue = string | number | boolean | AqlParam | AqlFunction;

export interface AqlParam {
  param: string;
}

/**
 * A function-call expression usable as a SELECT projection, an ORDER BY key, a
 * WHERE comparison operand, or an aggregate over a path.
 *
 * Covers the AQL 1.1.0 function families:
 *   - string:   LENGTH, CONTAINS, SUBSTRING, CONCAT, CONCAT_WS, POSITION
 *   - numeric:  ABS, MOD, CEIL, FLOOR, ROUND
 *   - date/time: CURRENT_DATE, CURRENT_TIME, CURRENT_DATE_TIME, NOW,
 *                CURRENT_TIMEZONE
 *   - terminology: TERMINOLOGY
 *   - aggregate: COUNT, MIN, MAX, SUM, AVG
 *
 * Arguments are themselves `AqlValue`s, so functions nest (e.g.
 * `ROUND(AVG(o/.../magnitude), 1)`). A bare path argument is carried as an
 * `AqlPath` wrapper so the serializer renders it unquoted (a path, not a
 * string literal).
 */
export interface AqlFunction {
  /** function name, upper-cased on emit (e.g. "COUNT", "ROUND", "CONCAT") */
  fn: string;
  /** call arguments, in order; empty for nullary fns like CURRENT_DATE() */
  args: AqlFunctionArg[];
  /** COUNT(DISTINCT …) / COUNT(*) marker — only meaningful for aggregates */
  distinct?: boolean;
  /** COUNT(*) marker */
  star?: boolean;
}

/** A bare identified-path operand inside a function call (rendered unquoted). */
export interface AqlPath {
  path: string;
}

export type AqlFunctionArg = AqlValue | AqlPath;

export interface SelectColumn {
  /**
   * identified path, e.g. "c/uid/value" or
   * "o/data[at0001]/events/.../magnitude". Optional when the column is a pure
   * function expression (`func` set) that takes no bare-path subject.
   */
  path?: string;
  alias?: string;
  /**
   * legacy aggregate shorthand — `COUNT(path)`, `AVG(path)`, … Retained for
   * the builder/serializer ergonomics; equivalent to a `func` whose single arg
   * is the column `path`.
   */
  aggregate?: "COUNT" | "MAX" | "MIN" | "SUM" | "AVG";
  /** full function-call projection (string/numeric/date/terminology/aggregate) */
  func?: AqlFunction;
}

export interface SelectClause {
  columns: SelectColumn[];
  distinct?: boolean;
  top?: number;
}

/**
 * VERSION containment selector. EHRbase exposes the version space through
 * `VERSION` containment; the predicate may be `LATEST_VERSION`, `ALL_VERSIONS`,
 * or a `version_at_time('…')` temporal constraint.
 */
export type VersionPredicate =
  | { kind: "latest" }
  | { kind: "all" }
  | { kind: "atTime"; time: AqlValue };

/** A node in the FROM containment tree (EHR CONTAINS COMPOSITION CONTAINS …). */
export interface FromExpr {
  rmType: string;
  alias?: string;
  /** archetype id constraint rendered inside `[...]` */
  archetypeId?: string;
  /** raw extra predicate rendered inside `[...]` (ANDed with archetypeId) */
  predicate?: string;
  /**
   * VERSION-only: the version selector rendered inside `[...]`
   * (`[LATEST_VERSION]`, `[ALL_VERSIONS]`, `[version_at_time('…')]`).
   */
  version?: VersionPredicate;
  contains?: ContainsExpr;
}

export interface ContainsExpr {
  op?: "AND" | "OR";
  /** when true, the whole containment group is negated: `NOT CONTAINS …` */
  negated?: boolean;
  items: FromExpr[];
}

export type ComparisonOp = "=" | "!=" | ">" | ">=" | "<" | "<=" | "like" | "matches";

export interface ComparisonCond {
  kind: "compare";
  /** left operand: an identified path, or a function expression over one */
  path: string;
  /** function form of the left operand (mutually exclusive with a bare path) */
  fn?: AqlFunction;
  op: ComparisonOp;
  value: AqlValue | AqlValue[];
}
export interface LogicalCond {
  kind: "and" | "or";
  operands: WhereExpr[];
}
export interface NotCond {
  kind: "not";
  operand: WhereExpr;
}
export interface ExistsCond {
  kind: "exists";
  path: string;
}
export type WhereExpr = ComparisonCond | LogicalCond | NotCond | ExistsCond;

export interface OrderByExpr {
  path: string;
  direction: "ASC" | "DESC";
}

export interface AqlQuery {
  select: SelectClause;
  from: FromExpr;
  where?: WhereExpr;
  orderBy?: OrderByExpr[];
  limit?: number;
  offset?: number;
  /** FETCH n (alias of LIMIT in the spec's LIMIT/OFFSET/FETCH family) */
  fetch?: number;
}
