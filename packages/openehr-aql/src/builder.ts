// Combinator builders for AQL WHERE conditions, SELECT functions, VERSION
// predicates, and parameters. Composing these keeps query construction
// type-safe and readable; pair with serializeAql / parseAql.

import type {
  AqlFunction,
  AqlFunctionArg,
  AqlParam,
  AqlPath,
  AqlValue,
  ComparisonCond,
  ComparisonOp,
  ExistsCond,
  LogicalCond,
  NotCond,
  VersionPredicate,
  WhereExpr,
} from "./ast.ts";

/** A `$name` runtime parameter reference. */
export function param(name: string): AqlParam {
  return { param: name };
}

/** A bare identified-path operand (rendered unquoted inside a function call). */
export function path(p: string): AqlPath {
  return { path: p };
}

/** A generic function-call expression: `fn(arg, arg, …)`. */
export function fn(name: string, ...args: AqlFunctionArg[]): AqlFunction {
  return { fn: name.toUpperCase(), args };
}

/** `COUNT(*)`. */
export function countStar(): AqlFunction {
  return { fn: "COUNT", args: [], star: true };
}

/** `COUNT(DISTINCT arg)`. */
export function countDistinct(arg: AqlFunctionArg): AqlFunction {
  return { fn: "COUNT", args: [arg], distinct: true };
}

export function compare(
  pathExpr: string,
  op: ComparisonOp,
  value: AqlValue | AqlValue[],
): ComparisonCond {
  return { kind: "compare", path: pathExpr, op, value };
}

/** A comparison whose left operand is a function expression rather than a path. */
export function compareFn(
  left: AqlFunction,
  op: ComparisonOp,
  value: AqlValue | AqlValue[],
): ComparisonCond {
  return { kind: "compare", path: "", fn: left, op, value };
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

export function exists(pathExpr: string): ExistsCond {
  return { kind: "exists", path: pathExpr };
}

/** `[LATEST_VERSION]` version selector. */
export function latestVersion(): VersionPredicate {
  return { kind: "latest" };
}

/** `[ALL_VERSIONS]` version selector. */
export function allVersions(): VersionPredicate {
  return { kind: "all" };
}

/** `[version_at_time('…')]` temporal version selector. */
export function versionAtTime(time: AqlValue): VersionPredicate {
  return { kind: "atTime", time };
}
