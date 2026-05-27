# ADR-0003 — SSR mode for authenticated routes

- **Status:** Accepted
- **Date:** 2026-05-27
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

Architecture-doc reference: §4 "SSR mode for this app". Ratified during
Milestone 2.

The app must (a) keep PHI off disk caches, (b) inject a per-request CSP nonce
into the SSR document (§5.7), and (c) gate protected routes server-side before
any PHI-bearing data is fetched.

## Decision

- Public routes (`/`) render with default SSR.
- The protected layout (`/_authed`) gates in `beforeLoad` via the `requireAuth`
  server function, which runs server-side and reads the `httpOnly` session
  cookie. An unauthenticated visitor is redirected into the Keycloak flow
  before any child loader runs.
- A per-request CSP nonce is minted in the request middleware (`src/start.ts`),
  carried through an `AsyncLocalStorage` scope, and read by the router
  (`router.options.ssr.nonce`) so `HeadContent`/`Scripts` stamp it onto the
  SSR'd tags. Authenticated responses are `Cache-Control: no-store`.
- The CSP enforces in production and ships Report-Only in dev/staging so the
  Vite HMR client is not blocked (§5.7).

## Consequences

**Positive:** server-side gating means PHI fetches never start for an
unauthenticated user; the nonce strategy (only possible with SSR) enables a
strict CSP without `unsafe-inline`. **Negative:** the nonce plumbing couples
the request middleware, an ambient global accessor, and the router factory;
this is documented in `src/start.ts` and `src/router.tsx`.
