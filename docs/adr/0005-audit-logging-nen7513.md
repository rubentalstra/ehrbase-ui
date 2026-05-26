# ADR-0005 — Audit logging shape

- **Status:** Proposed
- **Date:** 2026-05-26

## Context

Stub. Full content lands with Milestone 4. Architecture-doc reference: §14.

The summary: every server function that touches PHI emits an audit event matching the schema in §14.2. The persistence is hash-chained for tamper evidence (§14.5); subject identifiers are pseudonymized via HMAC (§14.4); storage is tiered hot/warm/cold (§14.6); retention is 20 years per WGBO (§14.7).

## Decision

To be ratified during Milestone 4.

## Consequences

To be documented.
