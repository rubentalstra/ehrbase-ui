# ADR-0017 — Multi-role design (physician + nurse + admin from day one)

- **Status:** Accepted
- **Date:** 2026-05-28
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

The §5.6 role model lists four runtime roles (`clinician` / `admin` / `audit-reviewer` / `researcher`) but the UI to date renders the same screens for all of them. Real hospital EPDs (HIX, Epic, Cerner) ship distinct **default home screens** per role because a physician's morning workflow is fundamentally different from a nurse's, which is different again from an admin's.

User decision (planning round 1, decision #2): **Multi-role from day one** — physician + nurse + admin home screens shipped with v1.0; tie-breaker for users with multiple roles via an **explicit picker on first login** (decision #12).

`clinician` in §5.6 is the existing umbrella role — this ADR splits it into two **clinical sub-roles** for the UI layer: `physician` and `nurse`. Both inherit from `clinician` for RBAC purposes (`requireRole('clinician')` matches both). The distinction is **for default-view selection**, not access control.

## Decision

**Role-specific home screens.** Five home variants ship with v1.0:

1. `physician` → ward / outpatient patient list with critical-flag highlighting, pending-signoffs, inbox preview.
2. `nurse` → my-ward patients with task badges (overdue / due-now / done), recent meds administered + sign-offs.
3. `admin` → operational widgets — active sessions, recent break-glass invocations, audit-review backlog.
4. `audit-reviewer` → sample-of-60 review queue + integrity-check status.
5. `researcher` → saved AQL queries + pseudonymisation-export jobs.

Each is `/_authed/home` resolving to the role's home component at the layout level.

**Role source.** A user's UI roles are derived from Keycloak realm claims (already in `session.roles`). The mapping is:

- Keycloak role `physician` → UI role `physician` (inherits `clinician`).
- Keycloak role `nurse` → UI role `nurse` (inherits `clinician`).
- Keycloak role `admin` / `audit-reviewer` / `researcher` → UI role of same name.

A user can hold multiple Keycloak roles (e.g. a clinical-informatics doctor who is both `physician` and `admin`).

**First-login picker.** A user with **two or more** UI roles hits `/_authed/role-picker` immediately after authentication. They pick one. The choice is stored as a per-user preference in our app DB (not Keycloak). On subsequent logins they go straight to that role's home; they can switch via the user menu (which re-routes to `/_authed/role-picker` if explicit, or just changes `activeRole` if implicit).

**Permission boundary.** Switching role at the UI does **not** elevate permissions. RBAC at the BFF still enforces `requireRole(...)` based on the actual session claims. A user whose Keycloak roles include `admin` _and_ `nurse` who picks the `nurse` home for the day can still hit admin endpoints if they navigate there — the UI just defaults to the nurse view.

**Single-role users.** Skip the picker; `/_authed/home` resolves directly to their role's home.

## Consequences

**Positive.** Matches HIX/Epic mental model — same app, different defaults per role. Doesn't fork the codebase per role (single React tree, role-aware layouts). RBAC stays in one place (the existing `requireRole`).

**Negative.** The home layouts are five separate React components — extra code surface. Mitigation: each home is a thin composition of widget components that can be reused across roles (e.g. the patient-list widget shows up in physician + nurse homes with different filters).

The role picker adds a one-time friction for multi-role users. Mitigation: it's first-login only; the user menu makes switching obvious afterwards.

The split of `clinician` into `physician` + `nurse` is a UI-layer distinction. RBAC at §5.6 keeps the umbrella `clinician` role for backwards compatibility — any code that checks `requireRole('clinician')` matches both sub-roles.
