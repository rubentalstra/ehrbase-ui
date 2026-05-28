# ADR-0020 — Print / PDF strategy

- **Status:** Accepted
- **Date:** 2026-05-28
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

Clinical workflows still require printed documents: discharge summaries, referral letters, vaccination certificates, lab requisitions. Two implementation routes:

1. **Browser print** — Tailwind `print:` variants + `page-break-*` CSS properties; the user's browser does the PDF generation (Cmd/Ctrl+P → Save as PDF).
2. **Server-side PDF** — Puppeteer / WeasyPrint / Playwright generating a PDF on the server, downloaded by the client.

## Decision

**v1.0 uses browser print + Tailwind `print:` variants.** Server-side PDF is v1.x (`docs/v1.x-roadmap.md`).

**Pattern.**

- Every printable surface (discharge, referrals, access log) ships a `print:` Tailwind stylesheet that:
  - Hides navigation, header, footer (`print:hidden` on shell elements).
  - Renders a print-only header with `{patient name | DOB | MRN | document title | print date}`.
  - Applies `page-break-before: always` / `page-break-inside: avoid` at the right boundaries.
  - Uses serif typography for body text (`print:font-serif`) — clinical convention; better OCR.
- An explicit "Print" button (`print:hidden`) calls `window.print()`.
- A "Preview" mode toggle shows the print view on screen before printing.

**File-format requirements.** When the document is shared electronically (e.g. attached to a referral exported via FHIR), it must be PDF/A — that's a v1.x concern with server-side generation.

**Document templates.**

- Discharge summary: assembles from existing data (problems, meds, recent results) plus a free-text summary. The HTML+CSS template is the source of truth; the printed output is the deliverable.
- Referral letter: similar, with the referral-question + clinical context.
- Vaccination certificate: assembles from `ACTION.immunisation.v1` records.
- Article-15 access log (patient): print-friendly version of `/me/access-log`.

## Consequences

**Positive.** No server-side PDF dependency in v1.0 → smaller attack surface, no Puppeteer/Chromium-on-server ops burden. Clinician can preview the printout before committing. Same HTML drives screen + paper, so there's one template per document type.

**Negative.** Browser print quality varies (Chrome vs Firefox vs Safari handle page breaks differently). Mitigation: the `print:` Tailwind classes are tested in Chromium (the primary deployment target, per §23 browser support); other browsers get an "If your printout looks wrong, use a Chromium-based browser" footer note for v1.0.

PDF/A compliance for archived clinical documents is a regulatory requirement in some EU member states (e.g. German DICOM/PDF/A retention rules). Browser print produces PDF but not PDF/A. v1.x server-side PDF generation closes this gap; v1.0 deployments that require PDF/A archive printouts through a separate PDF/A converter (operational concern, documented in deployment guide).

Documents stored back into EHRbase (e.g. a signed discharge summary stored as `DV_MULTIMEDIA` inside the COMPOSITION) at v1.0 store the user-generated PDF (browser print output). v1.x can regenerate from the COMPOSITION via server-side rendering, but the v1.0 stored artefact is whatever the user printed.
