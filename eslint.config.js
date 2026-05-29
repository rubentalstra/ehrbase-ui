// Root ESLint flat config — re-exports the shared monorepo config.
//
// The real flat-config lives at packages/config-eslint/index.js (ADR-0030).
// Keeping a root entry means `eslint .` invoked from the repo root still
// discovers a config; ESLint's flat-config resolution requires a config
// file at the working directory or above.

export { default } from '@ehrbase-ui/config-eslint'
