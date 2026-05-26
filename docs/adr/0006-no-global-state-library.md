# ADR-0006 — No global state library

- **Status:** Proposed
- **Date:** 2026-05-26

## Context

Stub. Full content lands with Milestone 3. Architecture-doc reference: §9.

The summary: server data → TanStack Query; URL-driven UI state → TanStack Router search params (Zod-validated); form state → react-hook-form; theme → small `ThemeProvider` writing to `localStorage` + class on `<html>`; sidebar state → cookie read on the server during SSR; component-local UI → `useState`. No Zustand / Jotai / Redux.

## Decision

To be ratified during Milestone 3.

## Consequences

To be documented.
