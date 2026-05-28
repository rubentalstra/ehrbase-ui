# ADR-0015 — Patient-centric workspace information architecture

- **Status:** Accepted
- **Date:** 2026-05-28
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

`docs/architecture.md` §6 historically described the UI as a generic shell + dynamic openEHR forms + AQL editor. That framing matches a power-user tool (the M3 shell + M14 AQL editor) — not the patient-centric workflow a clinician on a ward actually does, where every clinical action is **about a specific patient** and the URL / nav makes that explicit.

This ADR sets the workspace IA so every clinical surface in `docs/CLINICAL-UI.md` §7 lives under a consistent shape that a clinician can predict.

## Decision

**The workspace is patient-centric.** Authed routes split into three classes:

1. **Patient-bound surfaces** — every clinical view lives under `/_authed/patients/$patientId/<surface>`. The `$patientId` URL segment is the openEHR `ehr_id`. The `patients/$patientId/` layout fetches the patient header banner (M8) once and the child route renders inside.
2. **Cross-cutting surfaces** — `/_authed/inbox`, `/_authed/aql`, `/_authed/me`, `/_authed/me/access-log`, `/_authed/home`. Not bound to a single patient.
3. **Admin surfaces** — `/_authed/admin/{users | audit | cds-rules}`. Gated to the `admin` role.

**Breadcrumb pattern.** Every authed route renders breadcrumb `App › <Section> › <Page>`. Patient-bound surfaces insert `App › Patients › <Patient banner short> › <Surface>`.

**Deep-link rule.** Every URL is bookmarkable + shareable. Deep-linking to a patient view (e.g. `/en/_authed/patients/abc/vitals`) without a current session redirects to login + returns there. The session-load preserves the URL through the OIDC redirect chain (already implemented in M2's `/api/auth/login?redirect=...`).

**Locale prefix.** All patient surfaces sit under `/{locale}/_authed/...` per the symmetric prefix scheme (ADR-0014). Sharing a Dutch link to a German colleague redirects them to `/de/...` based on their cookie / `Accept-Language` / base.

**Role-specific home.** `/_authed/home` is the role's default screen (decision per ADR-0017). Multi-role users hit `/_authed/role-picker` on first login.

## Consequences

**Positive.** Every clinical screen has a predictable URL shape. The patient header banner can be a layout component, fetched once per patient navigation. Deep-linking + bookmarking work without ceremony. Audit lines carry the patient context naturally because it's in the URL.

**Negative.** The route tree is deeper than a tab-based UI would be (each surface is a sub-route, not a tab inside a single patient route). Mitigation: TanStack Router file-based routing + the layout-route pattern make the nesting cheap; the patient banner is a shared layout, not a per-surface fetch.

The scope of "patient-bound" vs "cross-cutting" is a discipline. A new surface that's "kinda" patient-bound (e.g. inbox messages tied to a patient) is cross-cutting in the IA but renders the patient banner when a message is opened. ADRs for those surfaces document the exception.

## Notes

- `docs/CLINICAL-UI.md` §4 ships the full sitemap derived from this ADR.
- ADR-0017 (multi-role) sets the home-route resolution rules.
