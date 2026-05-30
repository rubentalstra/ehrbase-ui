// Serialize an AQL AST to an AQL 1.1.0 statement string, and collect its
// `$parameters`.

import type {
  AqlQuery,
  AqlValue,
  ContainsExpr,
  FromExpr,
  SelectColumn,
  WhereExpr,
} from "./ast.ts";

function isParam(v: AqlValue): v is { param: string } {
  return typeof v === "object" && v !== null && "param" in v;
}

function serializeValue(value: AqlValue): string {
  if (isParam(value)) return `$${value.param}`;
  // Escape backslashes FIRST, then single quotes — otherwise the backslashes
  // added by quote-escaping would be doubled. Prevents AQL string injection.
  // (Parameterised values via `$param` remain the preferred path for untrusted input.)
  if (typeof value === "string") {
    return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  }
  return String(value);
}

function serializeColumn(col: SelectColumn): string {
  const expr = col.aggregate ? `${col.aggregate}(${col.path})` : col.path;
  return col.alias ? `${expr} AS ${col.alias}` : expr;
}

function serializeBracket(from: FromExpr): string {
  const parts = [from.archetypeId, from.predicate].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? `[${parts.join(" and ")}]` : "";
}

function serializeContains(contains: ContainsExpr): string {
  const items = contains.items.map(serializeFrom);
  if (items.length === 1) return ` CONTAINS ${items[0]}`;
  return ` CONTAINS (${items.join(` ${contains.op ?? "AND"} `)})`;
}

function serializeFrom(from: FromExpr): string {
  const head = [from.rmType, from.alias].filter(Boolean).join(" ") + serializeBracket(from);
  return from.contains ? head + serializeContains(from.contains) : head;
}

function serializeWhere(where: WhereExpr): string {
  switch (where.kind) {
    case "compare": {
      if (where.op === "matches") {
        const values = Array.isArray(where.value) ? where.value : [where.value];
        return `${where.path} matches {${values.map(serializeValue).join(", ")}}`;
      }
      const op = where.op === "like" ? "LIKE" : where.op;
      const value = Array.isArray(where.value) ? where.value[0] : where.value;
      return `${where.path} ${op} ${value === undefined ? "" : serializeValue(value)}`;
    }
    case "and":
    case "or": {
      const joiner = where.kind === "and" ? " AND " : " OR ";
      return where.operands
        .map((operand) => (operand.kind === "and" || operand.kind === "or" ? `(${serializeWhere(operand)})` : serializeWhere(operand)))
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
  return lines.join("\n");
}

/** Collect the distinct `$parameter` names referenced anywhere in a query. */
export function collectParams(query: AqlQuery): string[] {
  const names = new Set<string>();
  const visitValue = (v: AqlValue): void => {
    if (isParam(v)) names.add(v.param);
  };
  const visitWhere = (w: WhereExpr): void => {
    if (w.kind === "compare") {
      (Array.isArray(w.value) ? w.value : [w.value]).forEach(visitValue);
    } else if (w.kind === "and" || w.kind === "or") {
      w.operands.forEach(visitWhere);
    } else if (w.kind === "not") {
      visitWhere(w.operand);
    }
  };
  const visitFrom = (f: FromExpr): void => {
    f.contains?.items.forEach(visitFrom);
  };
  if (query.where) visitWhere(query.where);
  visitFrom(query.from);
  return [...names];
}
