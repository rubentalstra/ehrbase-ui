import { defineConfig } from "orval";

// docs/architecture.md §15 + ADR-0032.
//
// Self-contained generation (like the spec.json/schema pattern of the other
// openehr-* packages): the vendored OAS specs live in ./openapi (pinned by
// commit in ./openapi/.its-rest-commit), the config lives here, and the output
// lands in ./src/generated — all inside the package that owns them.
//
// Source: the official openEHR ITS-REST OpenAPI (OAS 3.0) — the REST surface
// EHRbase 2.31.0 implements. We emit Zod schemas (client: 'zod'), not a fetch
// client: the BFF proxy (apps/web/src/server/bff/) is hand-written, so we
// generate validation schemas and validate responses crossing the network
// boundary, because the running server may differ from the spec.
//
// One entry per API group (the core surface the form engine, AQL, and template
// fetch need). Demographic is deferred to the M7 pluggable provider; admin /
// system are added as further entries when consumed. Refresh: re-vendor the
// YAMLs (see ./openapi/.its-rest-commit) then `pnpm regen`.

const zodOutput = (api: string) => ({
  mode: "split" as const,
  target: `./src/generated/${api}`,
  client: "zod" as const,
  fileExtension: ".ts",
  override: {
    zod: {
      strict: { response: true, query: true, param: true, body: true },
    },
  },
});

export default defineConfig({
  ehr: {
    input: { target: "./openapi/.sanitized/ehr-codegen.openapi.yaml" },
    output: zodOutput("ehr"),
  },
  query: {
    input: { target: "./openapi/.sanitized/query-codegen.openapi.yaml" },
    output: zodOutput("query"),
  },
  definition: {
    input: { target: "./openapi/.sanitized/definition-codegen.openapi.yaml" },
    output: zodOutput("definition"),
  },
});
