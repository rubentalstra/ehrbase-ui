// AQL 1.1.0 abstract syntax tree.
//
// A typed model of an Archetype Query Language statement — SELECT / FROM (with
// CONTAINS) / WHERE / ORDER BY / LIMIT — sufficient to express the project's
// stored-query catalogue. The grammar/parser + CodeMirror integration are
// deferred to the M16 AQL editor; this package owns the AST, builder, and
// serializer.

/** A literal, or a `$name` runtime parameter. */
export type AqlValue = string | number | boolean | AqlParam;
export interface AqlParam {
  param: string;
}

export interface SelectColumn {
  /** identified path, e.g. "c/uid/value" or "o/data[at0001]/events/.../magnitude" */
  path: string;
  alias?: string;
  aggregate?: "COUNT" | "MAX" | "MIN" | "SUM" | "AVG";
}

export interface SelectClause {
  columns: SelectColumn[];
  distinct?: boolean;
  top?: number;
}

/** A node in the FROM containment tree (EHR CONTAINS COMPOSITION CONTAINS …). */
export interface FromExpr {
  rmType: string;
  alias?: string;
  /** archetype id constraint rendered inside `[...]` */
  archetypeId?: string;
  /** raw extra predicate rendered inside `[...]` (ANDed with archetypeId) */
  predicate?: string;
  contains?: ContainsExpr;
}

export interface ContainsExpr {
  op?: "AND" | "OR";
  items: FromExpr[];
}

export type ComparisonOp = "=" | "!=" | ">" | ">=" | "<" | "<=" | "like" | "matches";

export interface ComparisonCond {
  kind: "compare";
  path: string;
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
}
