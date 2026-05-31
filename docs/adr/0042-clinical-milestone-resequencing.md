# ADR-0042 — Clinical milestone re-sequencing (spine-first + M9 access governance)

- **Status:** Accepted
- **Date:** 2026-05-31
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —
- **Amends:** ADR-0021 (CDS placement)

## Context

The historical milestone order (`M8 → M19`) was mis-sequenced against real dependencies:

- **CDS (old M9) ran before the clinical data it evaluates** (vitals/labs old M10, meds/allergies
  old M12). Drug-allergy / critical-lab rules can't be built or tested end-to-end before the
  surfaces that produce that data exist.
- **Rich role dashboards (part of old M8) ran before the data they aggregate** (problems, meds,
  vitals, labs, tasks). The dashboards would have to be re-touched as each data surface landed.
- **Access auditing was deferred**, which conflicts with the M9 decision (ADR-0041) to build IHE
  ATNA early so every clinical surface is audited from day one.

The result was forward-dependencies that force "all over the place" work — the opposite of CLAUDE.md
Inviolable rule 13 (build a capability end-to-end in one milestone).

## Decision

Re-sequence the clinical build **spine-first**, with a clean renumber. Foundation milestones keep
their numbers (**M1, M2, M3, M5.5, M6**). New order:

| New     | Milestone                                                                                             | Old                                     |
| ------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------- |
| M7      | Demographic admin + EHR linkage                                                                       | M7                                      |
| M8      | 7-persona RBAC + workspace shell + patient context (+ care-team model, banner, search, basic landing) | M8 (split)                              |
| **M9**  | **Access governance — IHE ATNA audit + access control** (ADR-0041)                                    | NEW (revives M4 + M2-2A/2B, repurposed) |
| M10     | Problems + allergies + immunisations                                                                  | M12                                     |
| M11     | Medications                                                                                           | M12                                     |
| M12     | Clinical notes                                                                                        | M11                                     |
| M13     | Vitals flowsheet                                                                                      | M10                                     |
| M14     | Labs timeline                                                                                         | M10                                     |
| **M15** | **CDS** infra + runtime + authoring + 10-rule pack (after its data)                                   | M9 (moved)                              |
| M16     | Orders / CPOE                                                                                         | M13                                     |
| M17     | Care plan + tasks                                                                                     | M14                                     |
| M18     | Discharge + referrals + documents + print                                                             | M15                                     |
| M19     | Rich role dashboards (after the data exists)                                                          | M8 (moved late)                         |
| M20     | AQL editor + query catalogue                                                                          | M16                                     |
| M21     | Admin: user / role mgmt                                                                               | M17 (split)                             |
| M22     | Audit-review dashboard + Article-15 access log (read-side, fed by M9)                                 | M17-audit + M3/M4                       |
| M23     | Messaging / inbox                                                                                     | M18                                     |
| M24     | Hardening + release                                                                                   | M19                                     |

**Sequencing principles.**

1. **Patient spine first** — demographic admin (M7) → workspace shell + patient context (M8) →
   access governance (M9). Nothing clinical works without a patient, a banner, RBAC, and audit.
2. **Core record before decision-support** — problems/allergies → meds → notes → vitals → labs
   (M10–M14), then CDS (M15) wires its rules into surfaces that already exist.
3. **Audit emitter early, audit-review late** — the M9 emitter writes the trail from day one; the
   audit-review dashboard + Article-15 patient log (M22) are read-side consumers (the rule-13
   "fed by Mx" exception).
4. **Rich dashboards late (M19)** — they aggregate data from M10–M18, so they're built once, after
   that data exists.
5. **Empty-then-populating reads** — the patient banner + dashboards read aggregate AQL
   (`patient_summary_header`, etc.) that returns empty until upstream surfaces populate it, so they
   are built once and light up automatically. Not stubs — queries that return empty until data lands.

The old→new mapping table above is authoritative — the reused `M8…M19` numbers carry **new** content.

## Consequences

**Positive.** Removes every forward-dependency; each milestone is buildable end-to-end (rule 13).
CDS is one coherent milestone instead of rules scattered across five surfaces. The audit trail
exists before the surfaces that must be audited.

**Negative.** Anyone who memorised the old `M8…M19` numbers must consult the mapping table — the
numbers were reused with new scope. `docs/IMPLEMENTATION_CHECKLIST.md` carries the live numbering;
`docs/CLINICAL-UI.md` §7 surface tags and `docs/architecture.md` cross-refs are updated to match.
