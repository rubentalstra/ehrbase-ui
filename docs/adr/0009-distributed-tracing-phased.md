# ADR-0009 — Distributed tracing via OpenTelemetry

- **Status:** Proposed
- **Date:** 2026-05-26

## Context

Stub. Full content lands with Milestone 7. Architecture-doc reference: §13.2.

The summary: OpenTelemetry SDK with OTLP wire protocol, head-sample 10% at SDK + tail-sample 100% at collector for errors / slow requests, layered PHI redaction (SDK request hook, attribute block-list, collector attribute + transform processors), traces shipped to self-hosted Grafana Tempo.

## Decision

To be ratified during Milestone 7.

## Consequences

To be documented.
