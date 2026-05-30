// Sanitize the vendored openEHR ITS-REST OAS specs before orval (ADR-0032).
//
// The openEHR `definition` OAS (ADL-1.4 example payloads) carries `default`
// values that are NOT members of their own `enum` — synthetic generic type
// names like `DV_INTERVAL` defaulted onto `enum: ["DV_INTERVAL_of_DATE_TIME"]`.
// orval faithfully emits `z.enum([...]).default("DV_INTERVAL")`, which fails to
// type-check (and would throw at runtime if the default ever fired). It is a
// bug in the upstream spec.
//
// We strip ONLY those invalid defaults, from a COPY of each vendored spec — the
// vendored files under ./openapi stay byte-identical to upstream (provenance);
// orval reads the sanitized copies in ./openapi/.sanitized (gitignored).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(pkgDir, "openapi");
const outDir = path.join(srcDir, ".sanitized");

let stripped = 0;
/**
 * Recursively delete invalid `default`s:
 *  - on a `_type` discriminator property: the spec defaults it to the base type
 *    name (e.g. `DV_INTERVAL`), but orval derives the enum from the discriminator
 *    mapping (e.g. `DV_INTERVAL_of_DATE_TIME`) — the two always contradict, and a
 *    discriminator default is meaningless for validation anyway;
 *  - anywhere a `default` is not a member of its own `enum`/`const`.
 */
function sanitize(node, key) {
  if (Array.isArray(node)) {
    for (const item of node) sanitize(item, undefined);
    return;
  }
  if (node && typeof node === "object") {
    if ("default" in node) {
      const bad =
        key === "_type" ||
        (Array.isArray(node.enum) && !node.enum.includes(node.default)) ||
        ("const" in node && node.const !== node.default);
      if (bad) {
        delete node.default;
        stripped++;
      }
    }
    for (const [k, value] of Object.entries(node)) sanitize(value, k);
  }
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const file of fs.readdirSync(srcDir)) {
  if (!file.endsWith(".openapi.yaml")) continue;
  const spec = parse(fs.readFileSync(path.join(srcDir, file), "utf8"));
  sanitize(spec);
  fs.writeFileSync(path.join(outDir, file), stringify(spec));
}
console.log(`[sanitize-openapi] stripped ${stripped} invalid default(s) → openapi/.sanitized/`);
