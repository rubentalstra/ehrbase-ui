# ADR-0040 — Expanded 7-persona role model (physician + nurse + lab-technician + pharmacist + admin + audit-reviewer + researcher)

- **Status:** Accepted
- **Date:** 2026-05-31
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** ADR-0017
- **Superseded by:** —

## Context

ADR-0017 split the umbrella `clinician` role into two UI sub-roles (`physician` + `nurse`) and kept
`admin` / `audit-reviewer` / `researcher` — five personas. Building an HIX/Epic-class EPD on the
openEHR open standard surfaces two more first-class clinical personas whose workflow, default home,
and write-permissions differ materially:

- **`lab-technician` (laborant)** — enters / validates laboratory results (CLINICAL-UI §7.6). In the
  five-role model lab results were assigned to physicians, which does not match real lab workflow.
- **`pharmacist`** — verifies / dispenses medication orders, reviews interactions (CLINICAL-UI §7.9,
  §7.12). Medication safety is a distinct responsibility from prescribing (physician) and
  administering (nurse).

Today only four realm roles exist (`clinician` / `admin` / `audit-reviewer` / `researcher`), wired
into the `ROLES` arrays in `apps/web/src/server/auth/require-role.ts` +
`apps/web/src/lib/auth/auth.functions.ts` and seeded by `keycloak/config/ehrbase-realm.json`.

Adding `lab-technician` + `pharmacist` later would re-touch the role homes, the RBAC arrays, the
Keycloak realm, and the picker — the exact "build the same surface twice" cost CLAUDE.md Inviolable
rule 13 warns against. Decision (planning session 2026-05-31): **adopt the full seven-persona set now.**

## Decision

**Seven first-class personas, as Keycloak realm roles:**

`physician`, `nurse`, `lab-technician`, `pharmacist`, `admin`, `audit-reviewer`, `researcher`.

- **Clinical sub-role inheritance.** `physician` / `nurse` / `lab-technician` / `pharmacist` all
  inherit the umbrella `clinician` for coarse RBAC — `requireRole('clinician')` matches all four.
  The sub-role distinction drives (a) the default home screen and (b) fine-grained
  write-capability gating per surface (CLINICAL-UI §7 capability matrix), **not** coarse access.
- **`requireRole` source.** Extend the `ROLES` const in both
  `apps/web/src/server/auth/require-role.ts` and `apps/web/src/lib/auth/auth.functions.ts` to the
  seven-set; keep the `clinician` umbrella entry for backwards-compatible matching. Roles are read
  fresh per request from the Keycloak `realm_access.roles` claim (mirrored to the `keycloakRoles`
  column at provisioning).
- **Role homes.** Seven home variants. The **basic** my-patients landing ships in M8; the **rich**
  role-specific dashboards ship in M19 (after the data they aggregate exists — ADR-0042).
- **First-login picker** for multi-role users — retained verbatim from ADR-0017
  (`/_authed/role-picker`, choice stored as an app-DB preference, switchable from the user menu).
- **Realm seeding.** `keycloak/config/ehrbase-realm.json` gains the four new roles + one demo user
  per persona (config-as-code per ADR-0036). This realm/code work lands in M8, not in the doc
  re-plan that introduced this ADR.

**Permission boundary** (unchanged from ADR-0017): switching the UI home does not elevate
permissions; the BFF `requireRole(...)` enforces against the actual session claims.

## Consequences

**Positive.** Matches the HIX/Epic mental model (same app, role-specific defaults + write rights).
Single React tree, role-aware layouts; RBAC stays in one place. Adding the two personas now avoids a
mid-build role-model migration. Lab + pharmacy workflows map to the right persona from day one.

**Negative.** Seven home components instead of five — mitigated by composing each home from shared
widget components (the patient-list widget appears in physician + nurse + pharmacist homes with
different filters). The capability matrix per surface grows; it lives in CLINICAL-UI §7 as the
single source of truth.
