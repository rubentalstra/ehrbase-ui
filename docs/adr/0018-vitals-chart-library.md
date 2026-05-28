# ADR-0018 — Vitals chart library (Recharts)

- **Status:** Accepted
- **Date:** 2026-05-28
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

The vitals flowsheet (M9, `docs/CLINICAL-UI.md` §7.5) needs charts: line charts for trends (BP / pulse / temp / SpO2 / weight), sparklines for the patient banner's "trending" indicators, and small reference-range bands behind data lines.

`recharts` is already a dependency (`recharts@3.8.x`, pinned per `package.json`) and is one of the libraries shadcn's `chart.tsx` primitive wraps. Choosing it formally avoids the temptation to pull in Chart.js, ApexCharts, Tremor, Visx, or write D3 directly.

## Decision

**Use `recharts` for all clinical chart rendering in v1.0.** Wrap via the shadcn `chart.tsx` primitive (already vendored under `src/components/ui/chart.tsx`).

What `recharts` covers in v1.0:

- Line charts for vitals trends (BP, pulse, temp, SpO2, weight, growth charts).
- Sparklines for banner "trending" indicators (a tiny `LineChart` with no axes).
- Reference-range bands behind data lines (via `ReferenceArea`).
- Lab-result trends in M9 §7.6.

What `recharts` does NOT cover (out of scope for v1.0):

- DICOM image rendering — that's M16 with a PDF.js fallback for non-DICOM documents; DICOM-embedded is v1.x with a different toolkit (Cornerstone.js / OHIF — see `docs/v1.x-roadmap.md`).
- Anatomical heatmaps / body diagrams — defer to v1.x.
- Real-time streaming charts (continuous monitoring telemetry) — v1.x.

## Consequences

**Positive.** Single chart library across the app — predictable bundle size, single learning curve, single accessibility-review surface (recharts has reasonable SVG output with title/aria support). Already in the lockfile so no supply-chain delta.

**Negative.** `recharts` is fine but not best-in-class for very large datasets (>10 k points). Mitigation: the AQL catalogue (`docs/aql-catalogue.md`) caps trend queries at a `$limit` parameter; we never render a 10 k-point time series without aggregation.

Recharts' tooltip-positioning has known a11y quirks (`role="tooltip"` not always emitted reliably). Mitigation: the chart-axe pass in M9 verifies; the `chart.tsx` shadcn wrapper centralises the fix if needed.
