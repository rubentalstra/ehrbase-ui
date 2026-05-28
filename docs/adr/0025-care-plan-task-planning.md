# ADR-0025 — Care plan + task model: openEHR PROC (`WORK_PLAN` / `TASK_PLAN` / `PLAN_ITEM`)

- **Status:** Accepted
- **Date:** 2026-05-28
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

Care plans and order sets are the **process / workflow** dimension of clinical care — the orchestrated sequence of tasks, goals, and decision points that play out over a hospital stay, an outpatient course, or a chronic-disease pathway. openEHR has a dedicated **PROC** (Process / Task Planning) component, Release 1.7.0 at `specifications.openehr.org/releases/PROC/Release-1.7.0`. It defines three core classes:

- **`WORK_PLAN`** — the highest-level plan; contains `TASK_PLAN`s. Can reference an external `care_pathway` (e.g. a published guideline) or a `care_plan` (a CARE_ENTRY in the EHR).
- **`TASK_PLAN`** — a defined sequence of tasks for a specific purpose (e.g. "post-op day-1 checklist"). Each TASK_PLAN can reference a `guideline`, a `best_practice_ref`, and an `order_set_id` / `order_set_type` when the plan implements an order set.
- **`PLAN_ITEM`** — an individual task. PLAN_ITEM can be linked via the ENTRY-level `workflow_id` attribute to specific INSTRUCTION / ACTION compositions, tying the plan to the actual clinical entries.

Alternatives considered:

- **FHIR `CarePlan` + `Task`** — FHIR has its own care-plan model. Used for FHIR-native systems. Doesn't match our openEHR-native data layer.
- **Custom non-openEHR workflow engine** — adds a parallel data model alongside the EHR. Breaks the "single source of truth" principle.

User decision (planning round 1, decision #4 + the openEHR-purity preference): stay on openEHR. PROC is the right component.

## Decision

**v1.0 uses openEHR PROC (`WORK_PLAN` / `TASK_PLAN` / `PLAN_ITEM`) for care plans (M13) and order sets (M12).**

**Care plan (M13).**

- A patient on a care pathway gets a `WORK_PLAN` recorded in the EHR.
- Each phase / day / activity is a `TASK_PLAN`.
- Each concrete task is a `PLAN_ITEM`.
- Completing a task is an `ACTION.care_plan.vN` composition whose ENTRY-level `workflow_id` references the `PLAN_ITEM`.
- The nurse home (ADR-0017) dashboard reads "active tasks for my ward" via AQL over PLAN_ITEMs without a matching ACTION.

**Order sets (M12).**

- A medication / lab / imaging order set is a `TASK_PLAN` with `order_set_type` and `order_set_id` set.
- Each order in the set is a constituent `INSTRUCTION` composition (medication_order / laboratory_test_order / imaging_examination_request).
- Each INSTRUCTION's ENTRY-level `workflow_id` references the parent `TASK_PLAN.order_set_id` — so AQL can answer "which orders belong to this order set" without ambiguity.

**Care-pathway references.** A `WORK_PLAN` may reference an external `care_pathway` (e.g. NICE guideline, NL national pathway, local protocol). The reference is a URL / identifier; the actual content lives outside openEHR. The UI displays the pathway name + a link.

**Guideline references.** Same shape — `TASK_PLAN.guideline` references the source guideline. For CDS-rule-driven plans (e.g. a hypertension management pathway derived from an algorithm), the `guideline` field also identifies the source rule set.

**v1.0 archetypes** (per ADR-0016 to confirm exact CKM IDs at M13 time):

- `openEHR-EHR-INSTRUCTION.care_plan.v0` or latest stable — the care-plan entry itself.
- `openEHR-EHR-ACTION.care_plan.v0` — completion of a plan item.
- The PROC classes (`WORK_PLAN` / `TASK_PLAN` / `PLAN_ITEM`) are _reference-model_ classes, not archetypes; they're embedded in the composition.

**Display in the UI.** The care-plan screen renders the tree: `WORK_PLAN → TASK_PLAN → PLAN_ITEM`. Each PLAN_ITEM has a checkbox; checking it writes the corresponding `ACTION.care_plan` composition and (via the workflow_id link) closes the task in the tree.

## Consequences

**Positive.** Stays purely on the openEHR open standard. PROC is the canonical model — no parallel workflow engine. AQL queries can traverse the plan ↔ entry link (`workflow_id` is at the ENTRY level → consistent across INSTRUCTION / ACTION). Order sets and care plans share the same shape; one mental model.

**Negative.** PROC is a less-mature spec than the EHR IM — fewer publicly available reference implementations to learn from. Mitigation: the PROC classes are themselves small; the bulk of the work is the UI rendering of the tree + the workflow_id linking on writes. M13 will document the patterns we settle on in CLINICAL-UI.md §7.13.

PLAN_ITEM completion writes both an `ACTION` composition AND fires `workflow_id` linking — meaning a single user action results in two stored mutations. The dual-layer audit (ADR-0024) covers both. The integrity verifier in §14.5 cross-checks.

## Notes

- The PROC component is at Release 1.7.0 (verified 2026-05-28).
- Task-planning archetypes on CKM are under active development — the v1.0 catalogue (ADR-0016) pins the exact versions at M13 implementation time.
