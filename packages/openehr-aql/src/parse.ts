// Hand-written recursive-descent parser: AQL 1.1.0 string → typed AST.
//
// The inverse of serialize.ts. No parser-generator dependency (CLAUDE.md rule
// 5): a small tokeniser feeds a recursive-descent parser with explicit error
// positions. The grammar covered is exactly what serializeAql emits (so the
// two round-trip) plus the constructs the catalogue and EHRbase accept:
//
//   SELECT [DISTINCT] [TOP n] <projection> (, <projection>)*
//     projection := (path | function | aggregate) [AS alias]
//   FROM <containment>
//     containment := rmType [alias] [ '[' constraint ']' ]
//                    ( [NOT] CONTAINS ( <containment> | '(' group ')' ) )?
//     constraint  := archetypeId | LATEST_VERSION | ALL_VERSIONS
//                    | version_at_time('…') | raw-predicate   (and-joined)
//   WHERE <boolExpr>
//     boolExpr := orExpr ; orExpr := andExpr (OR andExpr)* ;
//     andExpr  := unary (AND unary)* ;
//     unary    := NOT? ( '(' boolExpr ')' | EXISTS path | comparison )
//     comparison := operand (=|!=|>|>=|<|<=|LIKE) value
//                 | operand MATCHES '{' value (, value)* '}'
//     operand  := path | function
//     value    := string | number | boolean | $param | function
//   ORDER BY <key> [ASC|DESC] (, …)*
//   LIMIT n / OFFSET n / FETCH n
//
// Tokeniser note: an identified path may embed attached node predicates
// (`o/data[at0001]/events[at0006]/…`). The tokeniser therefore lets a WORD
// token absorb *attached* balanced `[…]` groups (respecting quoted literals
// inside them). A `[` preceded by whitespace is its own token. This keeps FROM
// predicate brackets (`e[ehr_id/value=$ehrId]`) attached to their alias for
// raw capture, exactly as the serializer emits them.

import type {
  AqlFunction,
  AqlFunctionArg,
  AqlQuery,
  AqlValue,
  ComparisonCond,
  ComparisonOp,
  ContainsExpr,
  FromExpr,
  OrderByExpr,
  SelectClause,
  SelectColumn,
  VersionPredicate,
  WhereExpr,
} from "./ast.ts";

export interface ParseDiagnostic {
  message: string;
  /** zero-based character offset into the source string */
  position: number;
}

export class AqlParseError extends Error {
  readonly position: number;
  constructor(message: string, position: number) {
    super(message);
    this.name = "AqlParseError";
    this.position = position;
  }
}

export type TryParseResult =
  | { ok: true; query: AqlQuery }
  | { ok: false; errors: ParseDiagnostic[] };

type TokenType =
  | "word"
  | "string"
  | "number"
  | "param"
  | "op" // = != > >= < <=
  | "lparen"
  | "rparen"
  | "lbrace"
  | "rbrace"
  | "lbracket"
  | "comma"
  | "eof";

interface Token {
  type: TokenType;
  /** raw text (for word: includes any attached [...]; for string: decoded) */
  value: string;
  /** raw source slice (string tokens keep quotes here) */
  raw: string;
  start: number;
}

const AGGREGATES = new Set(["COUNT", "MIN", "MAX", "SUM", "AVG"]);

function isPathChar(ch: string): boolean {
  return /[A-Za-z0-9_./\-*]/.test(ch);
}

function isWordStart(ch: string): boolean {
  return /[A-Za-z0-9_*]/.test(ch);
}

class Tokeniser {
  private readonly src: string;
  private i = 0;
  constructor(src: string) {
    this.src = src;
  }

  private decodeString(start: number): Token {
    // src[start] === "'"
    let j = start + 1;
    let out = "";
    while (j < this.src.length) {
      const ch = this.src[j];
      if (ch === "\\") {
        const next = this.src[j + 1];
        if (next === undefined) break;
        out += next;
        j += 2;
        continue;
      }
      if (ch === "'") {
        const raw = this.src.slice(start, j + 1);
        this.i = j + 1;
        return { type: "string", value: out, raw, start };
      }
      out += ch;
      j += 1;
    }
    throw new AqlParseError("Unterminated string literal", start);
  }

  /** Consume a WORD: path chars plus attached balanced `[...]` groups. */
  private readWord(start: number): Token {
    let j = start;
    while (j < this.src.length) {
      const ch = this.src[j];
      if (ch !== undefined && isPathChar(ch)) {
        j += 1;
        continue;
      }
      if (ch === "[") {
        j = this.consumeBracket(j);
        continue;
      }
      break;
    }
    const value = this.src.slice(start, j);
    this.i = j;
    return { type: "word", value, raw: value, start };
  }

  /** Return index just past a balanced `[...]`, honouring quoted literals. */
  private consumeBracket(open: number): number {
    let depth = 0;
    let j = open;
    while (j < this.src.length) {
      const ch = this.src[j];
      if (ch === "'") {
        j = this.skipString(j);
        continue;
      }
      if (ch === "[") depth += 1;
      else if (ch === "]") {
        depth -= 1;
        if (depth === 0) return j + 1;
      }
      j += 1;
    }
    throw new AqlParseError("Unterminated '[' predicate", open);
  }

  private skipString(start: number): number {
    let j = start + 1;
    while (j < this.src.length) {
      const ch = this.src[j];
      if (ch === "\\") {
        j += 2;
        continue;
      }
      if (ch === "'") return j + 1;
      j += 1;
    }
    throw new AqlParseError("Unterminated string literal", start);
  }

  next(): Token {
    while (this.i < this.src.length && /\s/.test(this.src[this.i] ?? "")) this.i += 1;
    const start = this.i;
    if (start >= this.src.length) return { type: "eof", value: "", raw: "", start };
    const ch = this.src[start] ?? "";

    if (ch === "'") return this.decodeString(start);
    if (ch === "$") {
      let j = start + 1;
      while (j < this.src.length && /[A-Za-z0-9_]/.test(this.src[j] ?? "")) j += 1;
      const value = this.src.slice(start + 1, j);
      if (value === "") throw new AqlParseError("Empty parameter name after '$'", start);
      this.i = j;
      return { type: "param", value, raw: this.src.slice(start, j), start };
    }
    if (ch === "(") return this.single("lparen", start);
    if (ch === ")") return this.single("rparen", start);
    if (ch === "{") return this.single("lbrace", start);
    if (ch === "}") return this.single("rbrace", start);
    if (ch === "[") return this.single("lbracket", start);
    if (ch === "]") throw new AqlParseError("Unexpected ']'", start);
    if (ch === ",") return this.single("comma", start);

    if (ch === "=" || ch === ">" || ch === "<" || ch === "!") {
      const two = this.src.slice(start, start + 2);
      if (two === "!=" || two === ">=" || two === "<=") {
        this.i = start + 2;
        return { type: "op", value: two, raw: two, start };
      }
      if (ch === "!") throw new AqlParseError("Expected '!=' near '!'", start);
      this.i = start + 1;
      return { type: "op", value: ch, raw: ch, start };
    }

    // Number: optional leading '-' then digits, but only when followed by a
    // digit (so a bare '-' inside a path is handled by readWord, and a negative
    // numeric literal is still recognised).
    if (/[0-9]/.test(ch) || (ch === "-" && /[0-9]/.test(this.src[start + 1] ?? ""))) {
      let j = start + 1;
      while (j < this.src.length && /[-0-9.eE+]/.test(this.src[j] ?? "")) {
        // stop at a path separator that would make this a word, not a number
        const cj = this.src[j] ?? "";
        if (cj === "-" && !/[0-9]/.test(this.src[j + 1] ?? "")) break;
        j += 1;
      }
      const text = this.src.slice(start, j);
      if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(text)) {
        this.i = j;
        return { type: "number", value: text, raw: text, start };
      }
      // not a clean number — fall through to word handling from start
    }

    if (isWordStart(ch)) return this.readWord(start);

    throw new AqlParseError(`Unexpected character '${ch}'`, start);
  }

  private single(type: TokenType, start: number): Token {
    const raw = this.src[start] ?? "";
    this.i = start + 1;
    return { type, value: raw, raw, start };
  }
}

function tokenise(src: string): Token[] {
  const tk = new Tokeniser(src);
  const out: Token[] = [];
  for (;;) {
    const t = tk.next();
    out.push(t);
    if (t.type === "eof") break;
  }
  return out;
}

class Parser {
  private readonly tokens: Token[];
  private pos = 0;
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    const t = this.tokens[this.pos];
    if (t === undefined) {
      const last = this.tokens[this.tokens.length - 1];
      return last ?? { type: "eof", value: "", raw: "", start: 0 };
    }
    return t;
  }

  private take(): Token {
    const t = this.peek();
    if (t.type !== "eof") this.pos += 1;
    return t;
  }

  /** True if the next token is a WORD whose value upper-cases to `kw`. */
  private isKeyword(kw: string): boolean {
    const t = this.peek();
    return t.type === "word" && t.value.toUpperCase() === kw;
  }

  private expectKeyword(kw: string): Token {
    if (!this.isKeyword(kw)) {
      throw new AqlParseError(`Expected '${kw}'`, this.peek().start);
    }
    return this.take();
  }

  private expect(type: TokenType, label: string): Token {
    const t = this.peek();
    if (t.type !== type) {
      throw new AqlParseError(`Expected ${label}`, t.start);
    }
    return this.take();
  }

  parseQuery(): AqlQuery {
    const select = this.parseSelect();
    const from = this.parseFrom();
    const query: AqlQuery = { select, from };

    if (this.isKeyword("WHERE")) {
      this.take();
      query.where = this.parseWhere();
    }
    if (this.isKeyword("ORDER")) {
      query.orderBy = this.parseOrderBy();
    }
    // LIMIT / OFFSET / FETCH may appear in any order at the tail.
    for (;;) {
      if (this.isKeyword("LIMIT")) {
        this.take();
        query.limit = this.parseIntLiteral("LIMIT");
      } else if (this.isKeyword("OFFSET")) {
        this.take();
        query.offset = this.parseIntLiteral("OFFSET");
      } else if (this.isKeyword("FETCH")) {
        this.take();
        query.fetch = this.parseIntLiteral("FETCH");
      } else {
        break;
      }
    }

    if (this.peek().type !== "eof") {
      throw new AqlParseError(`Unexpected token '${this.peek().raw}'`, this.peek().start);
    }
    return query;
  }

  private parseIntLiteral(label: string): number {
    const t = this.expect("number", `a number after ${label}`);
    const n = Number(t.value);
    if (!Number.isInteger(n) || n < 0) {
      throw new AqlParseError(`${label} requires a non-negative integer`, t.start);
    }
    return n;
  }

  // ── SELECT ────────────────────────────────────────────────────────────
  private parseSelect(): SelectClause {
    this.expectKeyword("SELECT");
    const clause: SelectClause = { columns: [] };
    if (this.isKeyword("DISTINCT")) {
      this.take();
      clause.distinct = true;
    }
    if (this.isKeyword("TOP")) {
      this.take();
      clause.top = this.parseIntLiteral("TOP");
    }
    clause.columns.push(this.parseColumn());
    while (this.peek().type === "comma") {
      this.take();
      clause.columns.push(this.parseColumn());
    }
    if (clause.columns.length === 0) {
      throw new AqlParseError("SELECT requires at least one projection", this.peek().start);
    }
    return clause;
  }

  private parseColumn(): SelectColumn {
    const t = this.peek();
    if (t.type !== "word") {
      throw new AqlParseError("Expected a projection (path or function)", t.start);
    }
    let column: SelectColumn;
    if (this.isFunctionCallAhead()) {
      const f = this.parseFunctionCall();
      // Normalise an aggregate over a single bare path to the shorthand so the
      // AST round-trips with builder-shaped queries.
      const agg = this.asAggregateShorthand(f);
      column = agg ?? { func: f };
    } else {
      column = { path: this.take().value };
    }
    if (this.isKeyword("AS")) {
      this.take();
      const alias = this.expect("word", "an alias after AS");
      column.alias = alias.value;
    }
    return column;
  }

  private asAggregateShorthand(f: AqlFunction): SelectColumn | null {
    if (
      AGGREGATES.has(f.fn) &&
      !f.distinct &&
      !f.star &&
      f.args.length === 1
    ) {
      const arg = f.args[0];
      if (typeof arg === "object" && arg !== null && "path" in arg) {
        if (f.fn === "COUNT" || f.fn === "MIN" || f.fn === "MAX" || f.fn === "SUM" || f.fn === "AVG") {
          return { path: arg.path, aggregate: f.fn };
        }
      }
    }
    return null;
  }

  /** Whether the current WORD token is `name(` — a function call. */
  private isFunctionCallAhead(): boolean {
    const t = this.peek();
    if (t.type !== "word") return false;
    // A plain identifier followed by '(' with nothing in between. The word
    // tokeniser does not absorb '(' so the next token is the paren.
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(t.value)) return false;
    const nxt = this.tokens[this.pos + 1];
    return nxt !== undefined && nxt.type === "lparen";
  }

  private parseFunctionCall(): AqlFunction {
    const nameTok = this.take(); // word
    this.expect("lparen", "'(' after function name");
    const fn = nameTok.value.toUpperCase();
    const f: AqlFunction = { fn, args: [] };

    if (this.peek().type === "rparen") {
      this.take();
      return f;
    }
    // COUNT(*) / COUNT(DISTINCT x)
    if (fn === "COUNT") {
      if (this.peek().type === "word" && this.peek().value === "*") {
        this.take();
        f.star = true;
        this.expect("rparen", "')'");
        return f;
      }
      if (this.isKeyword("DISTINCT")) {
        this.take();
        f.distinct = true;
      }
    }
    f.args.push(this.parseFunctionArg());
    while (this.peek().type === "comma") {
      this.take();
      f.args.push(this.parseFunctionArg());
    }
    this.expect("rparen", "')' to close function call");
    return f;
  }

  private parseFunctionArg(): AqlFunctionArg {
    const t = this.peek();
    if (t.type === "string") {
      this.take();
      return t.value;
    }
    if (t.type === "number") {
      this.take();
      return Number(t.value);
    }
    if (t.type === "param") {
      this.take();
      return { param: t.value };
    }
    if (t.type === "word") {
      if (t.value.toUpperCase() === "TRUE") {
        this.take();
        return true;
      }
      if (t.value.toUpperCase() === "FALSE") {
        this.take();
        return false;
      }
      if (this.isFunctionCallAhead()) return this.parseFunctionCall();
      // a bare identified path argument
      this.take();
      return { path: t.value };
    }
    throw new AqlParseError("Expected a function argument", t.start);
  }

  // ── FROM ──────────────────────────────────────────────────────────────
  private parseFrom(): FromExpr {
    this.expectKeyword("FROM");
    return this.parseContainmentNode();
  }

  /** A single rmType [alias][predicate] followed by optional CONTAINS chain. */
  private parseContainmentNode(): FromExpr {
    const node = this.parseClassExpr();
    this.attachContains(node);
    return node;
  }

  private parseClassExpr(): FromExpr {
    const t = this.peek();
    if (t.type !== "word") {
      throw new AqlParseError("Expected an RM type in FROM/CONTAINS", t.start);
    }
    // The WORD may be `RMTYPE`, `RMTYPE[..]`, or `RMTYPE` (alias + bracket are
    // separate words). Split a leading attached bracket off the rmType word.
    const raw = this.take().value;
    const node: FromExpr = this.splitTypeAndBracket(raw);

    // optional alias (a following word that is NOT a keyword and not itself a
    // bracketed predicate-only token)
    const nxt = this.peek();
    if (nxt.type === "word" && !this.isContainmentKeyword(nxt.value) && !nxt.value.startsWith("[")) {
      // could be `alias` or `alias[predicate]`
      const aliasRaw = this.take().value;
      const aliasParsed = this.splitAliasAndBracket(aliasRaw);
      node.alias = aliasParsed.alias;
      if (aliasParsed.bracket !== undefined) this.applyBracket(node, aliasParsed.bracket);
    }
    return node;
  }

  private isContainmentKeyword(word: string): boolean {
    const up = word.toUpperCase();
    return (
      up === "CONTAINS" ||
      up === "AND" ||
      up === "OR" ||
      up === "NOT" ||
      up === "WHERE" ||
      up === "ORDER" ||
      up === "LIMIT" ||
      up === "OFFSET" ||
      up === "FETCH"
    );
  }

  /** Split `RMTYPE` or `RMTYPE[predicate]` (rmType has no alias). */
  private splitTypeAndBracket(raw: string): FromExpr {
    const idx = raw.indexOf("[");
    if (idx === -1) return { rmType: raw };
    const rmType = raw.slice(0, idx);
    const node: FromExpr = { rmType };
    this.applyBracket(node, raw.slice(idx));
    return node;
  }

  private splitAliasAndBracket(raw: string): { alias: string; bracket?: string } {
    const idx = raw.indexOf("[");
    if (idx === -1) return { alias: raw };
    return { alias: raw.slice(0, idx), bracket: raw.slice(idx) };
  }

  /** Apply a raw `[...]` bracket text to a FROM node (classify the content). */
  private applyBracket(node: FromExpr, bracketRaw: string): void {
    const inner = this.stripBracket(bracketRaw);
    // split on top-level " and " (case-insensitive), respecting quotes/brackets
    const parts = splitTopLevelAnd(inner);
    for (const part of parts) {
      const trimmed = part.trim();
      const up = trimmed.toUpperCase();
      if (up === "LATEST_VERSION") {
        node.version = { kind: "latest" };
      } else if (up === "ALL_VERSIONS") {
        node.version = { kind: "all" };
      } else if (/^version_at_time\s*\(/i.test(trimmed)) {
        node.version = parseVersionAtTime(trimmed);
      } else if (isArchetypeIdToken(trimmed)) {
        node.archetypeId = trimmed;
      } else {
        node.predicate = node.predicate === undefined ? trimmed : `${node.predicate} and ${trimmed}`;
      }
    }
  }

  private stripBracket(raw: string): string {
    if (!raw.startsWith("[") || !raw.endsWith("]")) {
      throw new AqlParseError("Malformed '[...]' predicate", this.peek().start);
    }
    return raw.slice(1, -1);
  }

  /** Parse zero or more `[NOT] CONTAINS …` onto `node`. */
  private attachContains(node: FromExpr): void {
    let negated = false;
    if (this.isKeyword("NOT")) {
      // lookahead: NOT CONTAINS
      const save = this.pos;
      this.take();
      if (this.isKeyword("CONTAINS")) {
        negated = true;
      } else {
        this.pos = save;
        return;
      }
    }
    if (!this.isKeyword("CONTAINS")) {
      if (negated) {
        throw new AqlParseError("Expected CONTAINS after NOT", this.peek().start);
      }
      return;
    }
    this.take(); // CONTAINS
    node.contains = this.parseContainsBody(negated);
  }

  private parseContainsBody(negated: boolean): ContainsExpr {
    if (this.peek().type === "lparen") {
      this.take();
      const items: FromExpr[] = [this.parseContainmentNode()];
      let op: "AND" | "OR" | undefined;
      while (this.isKeyword("AND") || this.isKeyword("OR")) {
        const kw = this.take().value.toUpperCase();
        op = kw === "OR" ? "OR" : "AND";
        items.push(this.parseContainmentNode());
      }
      this.expect("rparen", "')' to close CONTAINS group");
      const expr: ContainsExpr = { items };
      if (op !== undefined) expr.op = op;
      if (negated) expr.negated = true;
      return expr;
    }
    const single = this.parseContainmentNode();
    const expr: ContainsExpr = { items: [single] };
    if (negated) expr.negated = true;
    return expr;
  }

  // ── WHERE ───────────────────────────────────────────────────────────────
  private parseWhere(): WhereExpr {
    return this.parseOr();
  }

  private parseOr(): WhereExpr {
    let left = this.parseAnd();
    if (this.isKeyword("OR")) {
      const operands: WhereExpr[] = [left];
      while (this.isKeyword("OR")) {
        this.take();
        operands.push(this.parseAnd());
      }
      left = { kind: "or", operands };
    }
    return left;
  }

  private parseAnd(): WhereExpr {
    let left = this.parseUnary();
    if (this.isKeyword("AND")) {
      const operands: WhereExpr[] = [left];
      while (this.isKeyword("AND")) {
        this.take();
        operands.push(this.parseUnary());
      }
      left = { kind: "and", operands };
    }
    return left;
  }

  private parseUnary(): WhereExpr {
    if (this.isKeyword("NOT")) {
      this.take();
      return { kind: "not", operand: this.parseUnary() };
    }
    if (this.peek().type === "lparen") {
      this.take();
      const inner = this.parseOr();
      this.expect("rparen", "')' to close grouped condition");
      return inner;
    }
    if (this.isKeyword("EXISTS")) {
      this.take();
      const p = this.expect("word", "a path after EXISTS");
      return { kind: "exists", path: p.value };
    }
    return this.parseComparison();
  }

  private parseComparison(): ComparisonCond {
    const operand = this.parseWhereOperand();
    const t = this.peek();

    if (t.type === "op") {
      this.take();
      const opMap: Record<string, ComparisonOp> = {
        "=": "=",
        "!=": "!=",
        ">": ">",
        ">=": ">=",
        "<": "<",
        "<=": "<=",
      };
      const op = opMap[t.value];
      if (op === undefined) throw new AqlParseError(`Unknown operator '${t.value}'`, t.start);
      const value = this.parseWhereValue();
      return this.buildCompare(operand, op, value);
    }
    if (t.type === "word" && t.value.toUpperCase() === "LIKE") {
      this.take();
      const value = this.parseWhereValue();
      return this.buildCompare(operand, "like", value);
    }
    if (t.type === "word" && t.value.toUpperCase() === "MATCHES") {
      this.take();
      this.expect("lbrace", "'{' after MATCHES");
      const values: AqlValue[] = [this.parseWhereValue()];
      while (this.peek().type === "comma") {
        this.take();
        values.push(this.parseWhereValue());
      }
      this.expect("rbrace", "'}' to close MATCHES set");
      return this.buildCompare(operand, "matches", values);
    }
    throw new AqlParseError("Expected a comparison operator, LIKE, or MATCHES", t.start);
  }

  private buildCompare(
    operand: { path: string; fn?: AqlFunction },
    op: ComparisonOp,
    value: AqlValue | AqlValue[],
  ): ComparisonCond {
    const cond: ComparisonCond = { kind: "compare", path: operand.path, op, value };
    if (operand.fn !== undefined) cond.fn = operand.fn;
    return cond;
  }

  private parseWhereOperand(): { path: string; fn?: AqlFunction } {
    const t = this.peek();
    if (t.type !== "word") {
      throw new AqlParseError("Expected a path or function on the left of a comparison", t.start);
    }
    if (this.isFunctionCallAhead()) {
      return { path: "", fn: this.parseFunctionCall() };
    }
    return { path: this.take().value };
  }

  private parseWhereValue(): AqlValue {
    const t = this.peek();
    if (t.type === "string") {
      this.take();
      return t.value;
    }
    if (t.type === "number") {
      this.take();
      return Number(t.value);
    }
    if (t.type === "param") {
      this.take();
      return { param: t.value };
    }
    if (t.type === "word") {
      const up = t.value.toUpperCase();
      if (up === "TRUE") {
        this.take();
        return true;
      }
      if (up === "FALSE") {
        this.take();
        return false;
      }
      if (this.isFunctionCallAhead()) return this.parseFunctionCall();
      // a bare path/identifier value (e.g. RHS that is itself a path) — rare,
      // but the serializer never emits it; treat as a string-free identifier.
      throw new AqlParseError(
        `Expected a literal, $param, or function value, got '${t.value}'`,
        t.start,
      );
    }
    throw new AqlParseError("Expected a value", t.start);
  }

  // ── ORDER BY ──────────────────────────────────────────────────────────
  private parseOrderBy(): OrderByExpr[] {
    this.expectKeyword("ORDER");
    this.expectKeyword("BY");
    const keys: OrderByExpr[] = [this.parseOrderKey()];
    while (this.peek().type === "comma") {
      this.take();
      keys.push(this.parseOrderKey());
    }
    return keys;
  }

  private parseOrderKey(): OrderByExpr {
    const p = this.expect("word", "an ORDER BY key path");
    let direction: "ASC" | "DESC" = "ASC";
    if (this.isKeyword("ASC")) {
      this.take();
      direction = "ASC";
    } else if (this.isKeyword("DESC")) {
      this.take();
      direction = "DESC";
    }
    return { path: p.value, direction };
  }
}

/** Split a bracket-inner string on top-level " and " (respecting quotes/brackets). */
function splitTopLevelAnd(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inString = false;
  let token = "";
  let i = 0;
  while (i < inner.length) {
    const ch = inner[i] ?? "";
    if (inString) {
      token += ch;
      if (ch === "\\") {
        token += inner[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (ch === "'") inString = false;
      i += 1;
      continue;
    }
    if (ch === "'") {
      inString = true;
      token += ch;
      i += 1;
      continue;
    }
    if (ch === "[" || ch === "(") depth += 1;
    if (ch === "]" || ch === ")") depth -= 1;
    if (depth === 0) {
      const m = /^\s+and\s+/i.exec(inner.slice(i));
      if (m) {
        parts.push(token);
        token = "";
        i += m[0].length;
        continue;
      }
    }
    token += ch;
    i += 1;
  }
  if (token.trim() !== "") parts.push(token);
  return parts;
}

/** version_at_time('…') → atTime predicate (raw arg parsed as string/param). */
function parseVersionAtTime(text: string): VersionPredicate {
  const open = text.indexOf("(");
  const close = text.lastIndexOf(")");
  const arg = text.slice(open + 1, close).trim();
  if (arg.startsWith("$")) return { kind: "atTime", time: { param: arg.slice(1) } };
  if (arg.startsWith("'") && arg.endsWith("'")) {
    const decoded = arg.slice(1, -1).replace(/\\(.)/g, "$1");
    return { kind: "atTime", time: decoded };
  }
  return { kind: "atTime", time: arg };
}

/** Heuristic: does this bracket part look like an ADL archetype id? */
function isArchetypeIdToken(part: string): boolean {
  // archetype ids carry a '.vN' and contain no operators/spaces
  return /^[A-Za-z0-9]+-[A-Za-z0-9]+-[A-Z][A-Z0-9_]*\.[A-Za-z0-9_-]+\.v\d+$/.test(part);
}

/** Parse an AQL statement string into a typed AST. Throws AqlParseError. */
export function parseAql(query: string): AqlQuery {
  const tokens = tokenise(query);
  return new Parser(tokens).parseQuery();
}

/** Parse without throwing — returns the AST or structured diagnostics. */
export function tryParseAql(query: string): TryParseResult {
  try {
    return { ok: true, query: parseAql(query) };
  } catch (err) {
    if (err instanceof AqlParseError) {
      return { ok: false, errors: [{ message: err.message, position: err.position }] };
    }
    if (err instanceof Error) {
      return { ok: false, errors: [{ message: err.message, position: 0 }] };
    }
    return { ok: false, errors: [{ message: "Unknown parse error", position: 0 }] };
  }
}
