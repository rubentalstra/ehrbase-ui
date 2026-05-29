import { defineConfig } from 'orval'

// docs/architecture.md §15.
//
// Orval consumes the EHRbase OpenAPI spec (vendored under openapi/) and
// emits Zod schemas + typed clients into src/lib/api/ehrbase-generated/.
// We use Zod-mode strict on every response — clinical data must not cross
// the network boundary unvalidated, because the server might be a different
// version than the spec.
//
// The vendored spec is a 3-line placeholder during the foundation milestone;
// the real EHRbase OpenAPI gets fetched as part of Milestone 6 (AQL + REST
// API client work).

export default defineConfig({
  ehrbase: {
    input: { target: './openapi/ehrbase-openapi.yaml' },
    output: {
      mode: 'split',
      target: '../../packages/openehr-its-rest/src/generated',
      client: 'zod',
      fileExtension: '.ts',
      override: {
        zod: {
          strict: { response: true, query: true, param: true, body: true },
        },
      },
    },
  },
})
