// Refresh a package's vendored ./schema/ from openEHR/specifications-ITS-JSON.
//
//   node ../../scripts/openehr-fetch-schema.mjs            # fetch at the commit pinned in spec.json
//   node ../../scripts/openehr-fetch-schema.mjs --latest    # fetch HEAD of the schemaRef path + update spec.json commit
//
// This is the ONLY networked step. It vendors the raw draft-07 schema files
// into ./schema/ (committed, for provenance + offline deterministic regen) and
// records the source commit in spec.json. After fetching, run `pnpm regen`.
// (ADR-0032 + 2026-05-30 addendum.)

import fs from "node:fs";
import path from "node:path";

const REPO = "openEHR/specifications-ITS-JSON";
const latest = process.argv.includes("--latest");
const pkgDir = process.cwd();
const specPath = path.join(pkgDir, "spec.json");
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const schemaRef = spec.schemaRef; // e.g. components/BASE/Release-1.1.0

// ── Input validation (CodeQL: file→URL + network→file taint) ────────────────
// This script vendors files from a hardcoded GitHub repo into ./schema/. Two
// trust boundaries are guarded so neither the (committed) spec.json nor the
// GitHub API response can steer the URL host/path or escape the schema dir:
//   • schemaRef comes from spec.json → constrain to a repo-relative path under
//     components/ (no scheme, no `..`, no leading slash).
//   • commit is used in raw URLs and written back to spec.json → must be a SHA.
//   • each GitHub-listing entry.name is used in a filesystem path AND a URL →
//     must be a single safe path segment (no separators, no `..`).
const SCHEMA_REF_RE = /^components\/[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const COMMIT_RE = /^[0-9a-f]{7,40}$/;
const SAFE_SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
if (typeof schemaRef !== "string" || !SCHEMA_REF_RE.test(schemaRef) || schemaRef.includes("..")) {
  throw new Error(`spec.json schemaRef is not a safe repo-relative path: ${JSON.stringify(schemaRef)}`);
}
/** Reject anything from the GitHub listing that isn't a plain single path segment. */
function safeSegment(name) {
  if (typeof name !== "string" || !SAFE_SEGMENT_RE.test(name) || name === ".." || name.includes("..")) {
    throw new Error(`unsafe path segment in GitHub listing: ${JSON.stringify(name)}`);
  }
  return name;
}

async function gh(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "openehr-fetch-schema", Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${url}`);
  return res.json();
}

let commit = spec.schemaCommit;
if (latest) {
  const commits = await gh(
    `https://api.github.com/repos/${REPO}/commits?path=${schemaRef}&per_page=1`,
  );
  commit = commits[0].sha;
}
if (typeof commit !== "string" || !COMMIT_RE.test(commit)) {
  throw new Error(`resolved commit is not a git SHA: ${JSON.stringify(commit)}`);
}
console.log(`[fetch-schema] ${spec.component} ${spec.specVersion} @ ${commit}`);

async function walk(refPath, localBase) {
  const listing = await gh(
    `https://api.github.com/repos/${REPO}/contents/${refPath}?ref=${commit}`,
  );
  for (const entry of listing) {
    const name = safeSegment(entry.name);
    if (entry.type === "dir") {
      await walk(`${refPath}/${name}`, path.join(localBase, name));
    } else if (name.endsWith(".json")) {
      const raw = `https://raw.githubusercontent.com/${REPO}/${commit}/${refPath}/${name}`;
      const text = await (await fetch(raw, { headers: { "User-Agent": "openehr-fetch-schema" } })).text();
      fs.mkdirSync(localBase, { recursive: true });
      fs.writeFileSync(path.join(localBase, name), text);
    }
  }
}

const schemaDir = path.join(pkgDir, "schema");
fs.rmSync(schemaDir, { recursive: true, force: true });
await walk(schemaRef, schemaDir);

if (latest && commit !== spec.schemaCommit) {
  spec.schemaCommit = commit;
  fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  console.log(`[fetch-schema] updated spec.json schemaCommit → ${commit}`);
}
console.log(`[fetch-schema] vendored schema/ refreshed. Now run \`pnpm regen\`.`);
