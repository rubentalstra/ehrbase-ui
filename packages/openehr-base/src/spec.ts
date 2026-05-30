// openEHR spec coordinates this package targets. Kept in sync with spec.json
// by the `pnpm regen` discipline (ADR-0032 + 2026-05-30 addendum).
//
// Pinned to EHRbase 2.31.0 reality — BASE 1.1.0 (which pairs with RM 1.1.0),
// NOT the newer BASE 1.2.0. RM 1.1.0 (Sep 2020) predates BASE 1.2.0 (Apr 2021),
// so RM 1.1.0 is built on BASE 1.1.0.
//
// A `const` string-literal initializer already infers the literal type
// (`"BASE"` / `"1.1.0"`) — no annotation and no `as const` needed (the former
// trips prefer-as-const, the latter is banned by Inviolable rule 3).

export const SPEC_COMPONENT = "BASE";
export const SPEC_VERSION = "1.1.0";
