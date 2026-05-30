// Combinator builders for AQL WHERE conditions + parameters. Composing these
// keeps query construction type-safe and readable; pair with serializeAql.

import type {
  AqlParam,
  AqlValue,
  ComparisonCond,
  ComparisonOp,
  ExistsCond,
  LogicalCond,
  NotCond,
  WhereExpr,
} from "./ast.ts";

/** A `$name` runtime parameter reference. */
export function param(name: string): AqlParam {
  return { param: name };
}

export function compare(path: string, op: ComparisonOp, value: AqlValue | AqlValue[]): ComparisonCond {
  return { kind: "compare", path, op, value };
}

export function and(...operands: WhereExpr[]): LogicalCond {
  return { kind: "and", operands };
}

export function or(...operands: WhereExpr[]): LogicalCond {
  return { kind: "or", operands };
}

export function not(operand: WhereExpr): NotCond {
  return { kind: "not", operand };
}

export function exists(path: string): ExistsCond {
  return { kind: "exists", path };
}
