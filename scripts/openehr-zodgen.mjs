// Custom openEHR ITS-JSON → Zod generator (ADR-0032 second addendum, 2026-05-30).
//
// json-schema-to-zod does not resolve $refs (emits z.any()) and cannot model
// the openEHR polymorphism encoding — fine for the ref-free BASE leaf classes,
// useless for the ref-saturated, recursive RM. This generator compiles the
// (very regular) ITS-JSON draft-07 dialect directly to Zod:
//
//   - one `export const X = z.object({...}).strict()` + `export type X = z.infer<…>` per class
//   - every field that references another class is emitted as a Zod-4 GETTER
//     (`get f() { return … }`) so forward/mutual/self recursion is safe
//     (z.lazy is removed in Zod 4 — getters are the canonical pattern)
//   - openEHR polymorphism (`allOf` + `if`/`then` per `_type`) → `z.union([...])`
//     of the member class refs. A union (not discriminatedUnion) is correct here:
//     `_type` is optional with a default branch, and `.strict()` members
//     disambiguate. Single-member unions collapse to the member.
//   - cross-package refs (detected from the ref URL component, e.g. /BASE/) →
//     `<alias>.NAME` against an imported package (see spec.json "imports").
//   - enum → z.enum, const → z.literal, array → z.array(...).min(minItems),
//     string/integer/number/boolean → primitives; unknown → z.unknown().
//
//   node ../../scripts/openehr-zodgen.mjs          # regenerate (write)
//   node ../../scripts/openehr-zodgen.mjs --check   # CI drift gate
//
// Deterministic + offline (reads vendored ./schema). Provenance = spec.json commit.

import fs from "node:fs";
import path from "node:path";

const checkMode = process.argv.includes("--check");
const pkgDir = process.cwd();
const spec = JSON.parse(fs.readFileSync(path.join(pkgDir, "spec.json"), "utf8"));
const imports = spec.imports ?? {}; // { "BASE": "@ehrbase-ui/openehr-base" }
const importAlias = {}; // component -> local alias identifier
for (const comp of Object.keys(imports)) importAlias[comp] = comp.toLowerCase();

// ── load every vendored definition ──────────────────────────────────────────
function collect(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) collect(f, out);
    else if (e.name.endsWith(".json")) {
      const j = JSON.parse(fs.readFileSync(f, "utf8"));
      for (const [name, def] of Object.entries(j.definitions ?? {})) out[name] = def;
    }
  }
}
const defs = {};
collect(path.join(pkgDir, "schema"), defs);

// ── ref URL → Zod identifier ("NAME" local, or "<alias>.NAME" cross-package) ──
const REF_RE = /components\/([A-Z_]+)\/[^/]+\/[^/]+\/([A-Za-z0-9_]+)\.json#\/definitions\/([A-Za-z0-9_]+)/;
const LOCAL_RE = /^#\/definitions\/([A-Za-z0-9_]+)$/;
function refName(url) {
  // In-file self-reference: "#/definitions/NAME" (each schema file defines one
  // class, so a local ref is always to a class in THIS component). The recursive
  // branches (e.g. CLUSTER.items → CLUSTER) use this form, while cross-file refs
  // use absolute URLs — both must resolve or recursion silently drops members.
  const local = url.match(LOCAL_RE);
  if (local) return local[1];
  const m = url.match(REF_RE);
  if (!m) return null;
  const [, component, , name] = m;
  if (component === spec.component) return name;
  if (importAlias[component]) return `${importAlias[component]}.${name}`;
  return null;
}

// ── polymorphism: collect member refs from an allOf if/then chain ─────────────
function unionMembers(allOf) {
  const seen = new Set();
  const members = [];
  for (const branch of allOf) {
    const ref = branch?.then?.$ref;
    if (typeof ref === "string") {
      const n = refName(ref);
      if (n && !seen.has(n)) {
        seen.add(n);
        members.push(n);
      }
    }
  }
  return members;
}

// Hoist each distinct polymorphic union to a STABLE named const. Zod-4 recursion
// requires stable schema identity inside getters (the canonical pattern wraps a
// stable named schema, not a freshly-built one) — an inline `z.union([...])`
// rebuilt on every getter access breaks recursion at depth ≥ 2. Keyed by the
// sorted member set so identical unions dedupe. Emitted AFTER the class consts:
// getters reference the union by name lazily (no TDZ), and the union references
// the class consts that are already declared above it.
const unions = new Map(); // name -> "z.union([...])"
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
function unionConst(members) {
  const sorted = [...members].sort();
  const name = `U_${hash(sorted.join("|"))}`;
  if (!unions.has(name)) unions.set(name, `z.union([${sorted.join(", ")}])`);
  return name;
}

// ── compile a JSON-schema node to a Zod expression string ─────────────────────
function compile(node) {
  if (node == null || typeof node !== "object") return "z.unknown()";
  if (typeof node.$ref === "string") return refName(node.$ref) ?? "z.unknown()";
  if (Array.isArray(node.allOf)) {
    const members = unionMembers(node.allOf);
    if (members.length === 0) return "z.unknown()";
    if (members.length === 1) return members[0];
    return unionConst(members);
  }
  if (Array.isArray(node.enum)) {
    return `z.enum([${node.enum.map((v) => JSON.stringify(v)).join(", ")}])`;
  }
  if (node.const !== undefined) return `z.literal(${JSON.stringify(node.const)})`;
  const type = node.type;
  if (type === "array") {
    let expr = `z.array(${compile(node.items ?? {})})`;
    if (typeof node.minItems === "number") expr += `.min(${node.minItems})`;
    if (typeof node.maxItems === "number") expr += `.max(${node.maxItems})`;
    return expr;
  }
  if (type === "object" || node.properties) {
    if (!node.properties) return "z.record(z.string(), z.unknown())"; // generic (Interval lower/upper)
    return compileObject(node);
  }
  if (type === "string") return "z.string()";
  if (type === "integer") return "z.int()";
  if (type === "number") return "z.number()";
  if (type === "boolean") return "z.boolean()";
  return "z.unknown()";
}

// a field needs a getter if its schema (transitively) references any class
function referencesClass(node) {
  return JSON.stringify(node).includes("$ref");
}

function compileObject(node) {
  const required = new Set(Array.isArray(node.required) ? node.required : []);
  const lines = [];
  for (const [field, sub] of Object.entries(node.properties)) {
    const optional = !required.has(field) ? ".optional()" : "";
    if (referencesClass(sub)) {
      lines.push(`  get ${field}() { return ${compile(sub)}${optional}; },`);
    } else {
      lines.push(`  ${JSON.stringify(field)}: ${compile(sub)}${optional},`);
    }
  }
  // Use z.strictObject (not z.object(...).strict()): the `.strict()` METHOD
  // eagerly reads `.shape`, which fires the recursion getters at definition time
  // and hits forward-reference TDZ. z.strictObject keeps the shape (getters) lazy.
  const ctor = node.additionalProperties === false ? "z.strictObject" : "z.object";
  return `${ctor}({\n${lines.join("\n")}\n})`;
}

// ── emit module ───────────────────────────────────────────────────────────────
const classNames = Object.keys(defs).sort();
const banner =
  `// AUTOGENERATED — do not edit by hand.\n` +
  `// Run \`pnpm regen\` after editing spec.json (refresh schema/ first with \`pnpm regen:fetch\`).\n` +
  `// Source: ${spec.schemaSource} ${spec.schemaRef} @ ${spec.schemaCommit}\n` +
  `// openEHR ${spec.component} ${spec.specVersion} — ${classNames.length} classes. Custom ITS-JSON→Zod generator (ADR-0032 addendum).\n` +
  `/* eslint-disable */\n`;

let body = banner + `import { z } from "zod";\n`;
for (const comp of Object.keys(imports)) {
  body += `import * as ${importAlias[comp]} from ${JSON.stringify(imports[comp])};\n`;
}
body += "\n";
// Compile all classes first — this also populates the `unions` registry as a
// side effect of compiling polymorphic getters.
const classBodies = classNames.map(
  (cls) => `export const ${cls} = ${compile(defs[cls])};\nexport type ${cls} = z.infer<typeof ${cls}>;\n`,
);
for (const cb of classBodies) body += `${cb}\n`;
// Hoisted polymorphic unions, emitted AFTER the classes: `z.union([CLUSTER, …])`
// reads its members at declaration, so the class consts must already exist;
// class getters reference these union names lazily, so the forward order is safe.
body += `// ── hoisted polymorphic unions (stable identity for Zod-4 recursion) ──\n`;
for (const [name, expr] of unions) body += `const ${name} = ${expr};\n`;

const genDir = path.join(pkgDir, "src", "generated", spec.specVersion);
const genFile = path.join(genDir, "index.ts");
const currentFile = path.join(pkgDir, "src", "generated", "current.ts");
const currentBody =
  `// AUTOGENERATED — do not edit by hand. Run \`pnpm regen\`.\n` +
  `// Re-exports the active openEHR ${spec.component} ${spec.specVersion} generated types.\n` +
  `/* eslint-disable */\n` +
  `export * from "./${spec.specVersion}/index.ts";\n`;

if (checkMode) {
  const cur = fs.existsSync(genFile) ? fs.readFileSync(genFile, "utf8") : "";
  const curC = fs.existsSync(currentFile) ? fs.readFileSync(currentFile, "utf8") : "";
  if (cur !== body || curC !== currentBody) {
    console.error(`[openehr-zodgen] DRIFT in ${spec.component} ${spec.specVersion}. Run \`pnpm regen\`.`);
    process.exit(1);
  }
  console.log(`[openehr-zodgen] ${spec.component} ${spec.specVersion} up to date (${classNames.length} classes).`);
} else {
  fs.mkdirSync(genDir, { recursive: true });
  fs.writeFileSync(genFile, body);
  fs.writeFileSync(currentFile, currentBody);
  console.log(`[openehr-zodgen] wrote ${classNames.length} classes → ${path.relative(pkgDir, genFile)}`);
}
