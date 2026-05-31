// Identifier-level AQL validation (F5).
//
// validateAql(ast | string) walks an AQL statement and reports diagnostics at
// the levels this package can decide *without* an operational template:
//
//   1. FROM rmType / CONTAINS rmType names a real RM 1.1.0 class
//      (@ehrbase-ui/openehr-rm `isRmClass`).
//   2. Archetype-predicate ids are well-formed ADL 1.4 ids
//      (@ehrbase-ui/openehr-am `isArchetypeId`) and their RM-class segment is a
//      real RM class.
//   3. Node codes embedded in paths/predicates (`[at0001]`, `[ac0003]`) are
//      valid ADL 1.4 at/ac codes (@ehrbase-ui/openehr-am).
//   4. `$param` usage is internally consistent: when a set of *bound* params is
//      supplied, every referenced param must be in it (and, optionally, every
//      bound param should be used).
//
// DEPTH LIMIT (documented, intentional): this validator stops at the RM-class +
// identifier + parameter level. It deliberately does NOT check that a path is
// reachable under a given archetype, that a node code exists in that archetype,
// or that a value satisfies an archetype constraint — that needs the OPT /
// EHRbase web template (the archetype's flattened constraint model), which is
// not a dependency of this package (it lives behind the M6 form pipeline /
// EHRbase). Such checks are out of scope here; see @ehrbase-ui/openehr-web-template.

import { isArchetypeId, isAtCode, isAcCode, parseArchetypeId } from "@ehrbase-ui/openehr-am";
import { isRmClass } from "@ehrbase-ui/openehr-rm";

import type {
  AqlFunction,
  AqlFunctionArg,
  AqlQuery,
  AqlValue,
  ContainsExpr,
  FromExpr,
  VersionPredicate,
  WhereExpr,
} from "./ast.ts";
import { parseAql, type ParseDiagnostic } from "./parse.ts";

export type Severity = "error" | "warning";

export interface AqlDiagnostic {
  severity: Severity;
  message: string;
  /** zero-based character span into the source, when known */
  span?: { start: number; end: number };
}

export interface ValidateOptions {
  /**
   * The parameter names the caller will bind at execution time. When provided,
   * a referenced `$param` not in this set is an error, and a bound-but-unused
   * param is a warning. When omitted, only internal structure is checked
   * (param presence is informational only).
   */
  boundParams?: readonly string[];
}

// ANCHORED archetype-id matcher (whole token). Paired with the maximal-token
// tokenizer below: we extract maximal identifier tokens, then test each with
// this anchored pattern — rather than scanning the whole string with a global,
// unanchored regex. An unanchored global scan re-attempts the greedy leading
// `[A-Za-z0-9]+` at every offset inside a long character run, which is
// quadratic on adversarial input (CodeQL js/polynomial-redos). Anchored
// per-token matching is linear: `^`/`$` pin the single start/end, and every
// internal repetition is followed by a required literal (`-` / `.`) that lies
// OUTSIDE its own character class, so there is no ambiguous backtracking.
const ARCHETYPE_ID_RE = /^[A-Za-z0-9]+-[A-Za-z0-9]+-[A-Z][A-Z0-9_]*\.[A-Za-z0-9_-]+\.v\d+$/;
// Maximal run of archetype-id / node-code characters. A bare class repetition
// with nothing required after it never backtracks → linear-time tokenization.
const ID_TOKEN_RE = /[A-Za-z0-9._-]+/g;
// Match anything that *looks like* an at/ac node code attempt (`[at…]` / `[ac…]`)
// so a malformed one (`[at00X1]`) is caught rather than silently skipped. The
// exact at/ac grammar is then enforced by isAtCode / isAcCode. Bounded by the
// literal `[` / `]`, so it cannot exhibit the multi-start backtracking above.
const NODE_CODE_RE = /\[(at|ac)[A-Za-z0-9.]*]/g;

/** Validate an AQL query (AST or source string) at the identifier level. */
export function validateAql(input: AqlQuery | string, options: ValidateOptions = {}): AqlDiagnostic[] {
  const diags: AqlDiagnostic[] = [];

  let ast: AqlQuery;
  if (typeof input === "string") {
    try {
      ast = parseAql(input);
    } catch (err) {
      const parseDiag: ParseDiagnostic | undefined =
        err instanceof Error && "position" in err && typeof err.position === "number"
          ? { message: err.message, position: err.position }
          : undefined;
      diags.push({
        severity: "error",
        message: parseDiag ? `Parse error: ${parseDiag.message}` : "Parse error",
        ...(parseDiag ? { span: { start: parseDiag.position, end: parseDiag.position } } : {}),
      });
      return diags;
    }
  } else {
    ast = input;
  }

  const referencedParams = new Set<string>();

  const recordArchetype = (id: string): void => {
    if (!isArchetypeId(id)) {
      diags.push({ severity: "error", message: `Malformed archetype id: '${id}'` });
      return;
    }
    const parsed = parseArchetypeId(id);
    if (parsed && !isRmClass(parsed.rmClass)) {
      diags.push({
        severity: "error",
        message: `Archetype id '${id}' names unknown RM class '${parsed.rmClass}'`,
      });
    }
  };

  const recordEmbeddedIdentifiers = (text: string): void => {
    for (const m of text.matchAll(ID_TOKEN_RE)) {
      if (ARCHETYPE_ID_RE.test(m[0])) recordArchetype(m[0]);
    }
    for (const m of text.matchAll(NODE_CODE_RE)) {
      const code = m[0].slice(1, -1);
      if (!isAtCode(code) && !isAcCode(code)) {
        diags.push({ severity: "error", message: `Invalid node code: '${code}'` });
      }
    }
  };

  const recordParamsInArg = (arg: AqlFunctionArg): void => {
    if (typeof arg === "object" && arg !== null) {
      if ("param" in arg) referencedParams.add(arg.param);
      else if ("fn" in arg) arg.args.forEach(recordParamsInArg);
    }
  };
  const recordParamsInValue = (v: AqlValue): void => {
    recordParamsInArg(v);
  };
  const recordParamsInFn = (f: AqlFunction): void => {
    f.args.forEach(recordParamsInArg);
  };

  const visitVersion = (v: VersionPredicate | undefined): void => {
    if (v && v.kind === "atTime") recordParamsInValue(v.time);
  };

  const visitFrom = (from: FromExpr): void => {
    if (!isRmClass(from.rmType)) {
      diags.push({ severity: "error", message: `Unknown RM class in FROM/CONTAINS: '${from.rmType}'` });
    }
    if (from.archetypeId !== undefined) recordArchetype(from.archetypeId);
    if (from.predicate !== undefined) recordEmbeddedIdentifiers(from.predicate);
    visitVersion(from.version);
    if (from.contains) visitContains(from.contains);
  };

  const visitContains = (c: ContainsExpr): void => {
    c.items.forEach(visitFrom);
  };

  const visitWhere = (w: WhereExpr): void => {
    switch (w.kind) {
      case "compare":
        if (w.fn) recordParamsInFn(w.fn);
        if (w.path) recordEmbeddedIdentifiers(w.path);
        (Array.isArray(w.value) ? w.value : [w.value]).forEach(recordParamsInValue);
        break;
      case "and":
      case "or":
        w.operands.forEach(visitWhere);
        break;
      case "not":
        visitWhere(w.operand);
        break;
      case "exists":
        recordEmbeddedIdentifiers(w.path);
        break;
    }
  };

  // SELECT projections
  for (const col of ast.select.columns) {
    if (col.path !== undefined) recordEmbeddedIdentifiers(col.path);
    if (col.func) recordParamsInFn(col.func);
  }
  // FROM (+ CONTAINS)
  visitFrom(ast.from);
  // WHERE
  if (ast.where) visitWhere(ast.where);
  // ORDER BY
  if (ast.orderBy) {
    for (const o of ast.orderBy) recordEmbeddedIdentifiers(o.path);
  }

  // Parameter consistency.
  if (options.boundParams !== undefined) {
    const bound = new Set(options.boundParams);
    for (const ref of referencedParams) {
      if (!bound.has(ref)) {
        diags.push({ severity: "error", message: `Unresolved parameter '$${ref}' (not bound)` });
      }
    }
    for (const b of bound) {
      if (!referencedParams.has(b)) {
        diags.push({ severity: "warning", message: `Bound parameter '$${b}' is never referenced` });
      }
    }
  }

  return diags;
}

/** True when validateAql returns no `error`-severity diagnostics. */
export function isValidAql(input: AqlQuery | string, options: ValidateOptions = {}): boolean {
  return validateAql(input, options).every((d) => d.severity !== "error");
}
