# ADR-0008 — CI/CD pipeline shape

- **Status:** Proposed
- **Date:** 2026-05-26

## Context

Stub. Full content lands with step 1L. Architecture-doc reference: §20.

The summary: pin every action to a full commit SHA, minimum-privilege `GITHUB_TOKEN`, keyless Cosign signing, SBOM on every release, Trivy + Semgrep + CodeQL + `pnpm audit signatures`, runner hardening via `step-security/harden-runner`, no `pull_request_target`.

## Decision

To be ratified once step 1L lands.

## Consequences

To be documented.
