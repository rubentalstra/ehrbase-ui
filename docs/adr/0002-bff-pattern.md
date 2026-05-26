# ADR-0002 — BFF pattern (Keycloak inside the TanStack Start process)

- **Status:** Proposed
- **Date:** 2026-05-26
- **Deciders:** Initial maintainer (@rubentalstra)

## Context

Stub. Full content lands with Milestone 2. Architecture-doc reference: §5.

The summary: browser-side OAuth tokens are unacceptable for clinical data. The BFF pattern keeps OAuth tokens server-side inside the TanStack Start process; the browser holds only an opaque encrypted session cookie tied to a Valkey-stored session.

## Decision

To be ratified during Milestone 2 implementation.

## Consequences

To be documented.
