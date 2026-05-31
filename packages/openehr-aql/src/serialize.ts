// Serialize an AQL AST to an AQL 1.1.0 statement string, and collect its
// `$parameters`. Inverse of parse.ts — keep the two symmetric.

import type {
  AqlFunction,
  AqlFunctionArg,
  AqlParam,
  AqlPath,
  AqlQuery,
  AqlValue,
  ContainsExpr,
  FromExpr,
  SelectColumn,
  VersionPredicate,
  WhereExpr,
} from "./ast.ts";

function isParam(v: AqlFunctionArg): v is AqlParam {
  return typeof v === "object" && v !== null && "param" in v;
}

function isPathArg(v: AqlFunctionArg): v is AqlPath {
  return typeof v === "object" && v !== null && "path" in v;
}

function isFunction(v: AqlFunctionArg): v is AqlFunction {
  return typeof v === "object" && v !== null && "fn" in v;
}

function serializeString(value: string): string {
  // Escape backslashes FIRST, then single quotes — otherwise the backslashes
  // added by quote-escaping would be doubled. Prevents AQL string injection.
  // (Parameterised values via `$param` remain the preferred path for untrusted
  // input.)
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function serializeFunction(f: AqlFunction): string {
  if (f.star) return `${f.fn}(*)`;
  const inner = f.args.map(serializeArg).join(", ");
  return f.distinct ? `${f.fn}(DISTINCT ${inner})` : `${f.fn}(${inner})`;
}

function serializeArg(value: AqlFunctionArg): string {
  if (isParam(value)) return `$${value.param}`;
  if (isPathArg(value)) return value.path;
  if (isFunction(value)) return serializeFunction(value);
  if (typeof value === "string") return serializeString(value);
  return String(value);
}

/** Serialize a comparison/literal value (no bare-path wrapper at this level). */
function serializeValue(value: AqlValue): string {
  if (typeof value === "object" && value !== null && "fn" in value) {
    return serializeFunction(value);
  }
  if (typeof value === "object" && value !== null && "param" in value) {
    return `$${value.param}`;
  }
  if (typeof value === "string") return serializeString(value);
  return String(value);
}

function serializeColumn(col: SelectColumn): string {
  let expr: string;
  if (col.func) {
    expr = serializeFunction(col.func);
  } else if (col.aggregate) {
    expr = `${col.aggregate}(${col.path ?? ""})`;
  } else {
    expr = col.path ?? "";
  }
  return col.alias ? `${expr} AS ${col.alias}` : expr;
}

function serializeVersion(v: VersionPredicate): string {
  switch (v.kind) {
    case "latest":
      return "LATEST_VERSION";
    case "all":
      return "ALL_VERSIONS";
    case "atTime":
      return `version_at_time(${serializeValue(v.time)})`;
  }
}

function serializeBracket(from: FromExpr): string {
  const parts: string[] = [];
  if (from.archetypeId !== undefined && from.archetypeId !== "") parts.push(from.archetypeId);
  if (from.version !== undefined) parts.push(serializeVersion(from.version));
  if (from.predicate !== undefined && from.predicate !== "") parts.push(from.predicate);
  return parts.length > 0 ? `[${parts.join(" and ")}]` : "";
}

function serializeContains(contains: ContainsExpr): string {
  const keyword = contains.negated ? " NOT CONTAINS " : " CONTAINS ";
  const items = contains.items.map(serializeFrom);
  if (items.length === 1) return `${keyword}${items[0]}`;
  return `${keyword}(${items.join(` ${contains.op ?? "AND"} `)})`;
}

function serializeFrom(from: FromExpr): string {
  const head = [from.rmType, from.alias].filter(Boolean).join(" ") + serializeBracket(from);
  return from.contains ? head + serializeContains(from.contains) : head;
}

function serializeCompareLeft(where: { path: string; fn?: AqlFunction }): string {
  return where.fn ? serializeFunction(where.fn) : where.path;
}

function serializeWhere(where: WhereExpr): string {
  switch (where.kind) {
    case "compare": {
      const left = serializeCompareLeft(where);
      if (where.op === "matches") {
        const values = Array.isArray(where.value) ? where.value : [where.value];
        return `${left} matches {${values.map(serializeValue).join(", ")}}`;
      }
      const op = where.op === "like" ? "LIKE" : where.op;
      const value = Array.isArray(where.value) ? where.value[0] : where.value;
      return `${left} ${op} ${value === undefined ? "" : serializeValue(value)}`;
    }
    case "and":
    case "or": {
      const joiner = where.kind === "and" ? " AND " : " OR ";
      return where.operands
        .map((operand) =>
          operand.kind === "and" || operand.kind === "or"
            ? `(${serializeWhere(operand)})`
            : serializeWhere(operand),
        )
        .join(joiner);
    }
    case "not":
      return `NOT (${serializeWhere(where.operand)})`;
    case "exists":
      return `EXISTS ${where.path}`;
  }
}

/** Serialize an AQL AST to an AQL statement string. */
export function serializeAql(query: AqlQuery): string {
  const select = [
    "SELECT",
    query.select.distinct ? "DISTINCT" : "",
    query.select.top !== undefined ? `TOP ${query.select.top}` : "",
    query.select.columns.map(serializeColumn).join(", "),
  ]
    .filter(Boolean)
    .join(" ");

  const lines = [select, `FROM ${serializeFrom(query.from)}`];
  if (query.where) lines.push(`WHERE ${serializeWhere(query.where)}`);
  if (query.orderBy && query.orderBy.length > 0) {
    lines.push(`ORDER BY ${query.orderBy.map((o) => `${o.path} ${o.direction}`).join(", ")}`);
  }
  if (query.limit !== undefined) lines.push(`LIMIT ${query.limit}`);
  if (query.offset !== undefined) lines.push(`OFFSET ${query.offset}`);
  if (query.fetch !== undefined) lines.push(`FETCH ${query.fetch}`);
  return lines.join("\n");
}

/** Collect the distinct `$parameter` names referenced anywhere in a query. */
export function collectParams(query: AqlQuery): string[] {
  const names = new Set<string>();
  const visitArg = (v: AqlFunctionArg): void => {
    if (isParam(v)) {
      names.add(v.param);
    } else if (isFunction(v)) {
      v.args.forEach(visitArg);
    }
  };
  const visitValue = (v: AqlValue): void => {
    visitArg(v);
  };
  const visitWhere = (w: WhereExpr): void => {
    if (w.kind === "compare") {
      if (w.fn) visitArg(w.fn);
      (Array.isArray(w.value) ? w.value : [w.value]).forEach(visitValue);
    } else if (w.kind === "and" || w.kind === "or") {
      w.operands.forEach(visitWhere);
    } else if (w.kind === "not") {
      visitWhere(w.operand);
    }
  };
  const visitVersion = (v: VersionPredicate | undefined): void => {
    if (v && v.kind === "atTime") visitValue(v.time);
  };
  const visitColumn = (c: SelectColumn): void => {
    if (c.func) visitArg(c.func);
  };
  const visitFrom = (f: FromExpr): void => {
    visitVersion(f.version);
    f.contains?.items.forEach(visitFrom);
  };
  query.select.columns.forEach(visitColumn);
  if (query.where) visitWhere(query.where);
  visitFrom(query.from);
  return [...names];
}
