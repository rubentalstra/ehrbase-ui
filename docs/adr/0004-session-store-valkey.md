# ADR-0004 — Session store: Valkey, not iron-session

- **Status:** Proposed
- **Date:** 2026-05-26

## Context

Stub. Full content lands with Milestone 2. Architecture-doc reference: §5.3.

## Decision

Use Valkey from day one as the server-side session store. The audit hash chain (§14) needs a fast key-value store regardless; consolidating on one Valkey instance avoids deploying two stores. Server-side storage enables immediate revocation.

## Consequences

To be documented during Milestone 2.
