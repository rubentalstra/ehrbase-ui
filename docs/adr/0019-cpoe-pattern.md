# ADR-0019 — CPOE pattern (openEHR INSTRUCTION + ACTION)

- **Status:** Accepted
- **Date:** 2026-05-28
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

Computerised Physician Order Entry (CPOE — M12) covers medication orders, lab orders, and imaging requests, plus tracking which orders have been fulfilled. Two standards compete in EU healthcare:

1. **openEHR INSTRUCTION + ACTION** — orders are `INSTRUCTION` compositions; fulfilment is `ACTION` compositions; the openEHR PROC component (`WORK_PLAN` / `TASK_PLAN` / `PLAN_ITEM`) wraps them when they're part of a care pathway or order set.
2. **FHIR `ServiceRequest` + `Task` / `MedicationRequest` + `MedicationAdministration`** — the HL7 FHIR R4/R5 equivalents.

This is an **openEHR-native** project (per the user's most-important constraint). FHIR is the interoperability boundary for inter-system exchange (CANONICAL composition export → FHIR bundle), not the native data model.

## Decision

**v1.0 stores orders + fulfilment as openEHR INSTRUCTION + ACTION compositions.** FHIR is purely an export format (CANONICAL → FHIR Bundle for inter-system handoff, e.g. lab system / imaging system / pharmacy).

**Order data model.**

- Medication order: `openEHR-EHR-INSTRUCTION.medication_order.v3` (ATC-coded medication, dose, route, timing).
- Lab order: `openEHR-EHR-INSTRUCTION.laboratory_test_order.v1` (LOINC-coded test panel).
- Imaging order: `openEHR-EHR-INSTRUCTION.imaging_examination_request.v1` (SNOMED CT modality + body site).

**Fulfilment.**

- Medication administered: `openEHR-EHR-ACTION.medication.v1`. References the originating INSTRUCTION via `instruction_details.instruction_id`.
- Procedure performed: `openEHR-EHR-ACTION.procedure.v1`.

**Order sets.** When clinicians prescribe a bundle (e.g. "post-op order set: pain meds + DVT prophylaxis + IV fluids"), the order set is recorded via the openEHR **PROC** component's `TASK_PLAN.order_set_id` / `order_set_type` attributes (ADR-0025). Each constituent order is a separate INSTRUCTION composition; the PROC `TASK_PLAN` ties them together.

**Linking back to the order from fulfilment.** Every ACTION references its triggering INSTRUCTION via the openEHR `workflow_id` link (in the `ENTRY` superclass). This is what makes "show me all pending orders" (INSTRUCTIONs without a linked ACTION) queryable in AQL.

**Status tracking.** The "pending / active / completed / cancelled" status of an order is derived from the AQL pattern: an INSTRUCTION with no matching ACTION = pending; with a matching `ACTION.medication.v1` = active/completed; cancellation = a follow-up INSTRUCTION amendment.

**External system handoff.** When an order needs to leave EHRbase (e.g. to the hospital pharmacy or LIS):

1. Read the INSTRUCTION as CANONICAL JSON.
2. Map to FHIR `MedicationRequest` / `ServiceRequest` via a deterministic transformer (M12 ships a minimal transformer for the three order types).
3. Post to the configured downstream endpoint.

The transformer is one-way at v1.0 (we don't receive FHIR back). Bi-directional FHIR is a v1.x integration.

## Consequences

**Positive.** Stays purely on the openEHR standard. PROC component wraps order sets naturally. AQL pattern for "pending orders" is the same for medications / labs / imaging. CDS rules (ADR-0021) bind to INSTRUCTION archetype paths.

**Negative.** FHIR is the lingua franca for cross-system handoff; we have to maintain the openEHR→FHIR transformer. The transformer is small (three archetypes) but it's an extra surface to test. Mitigation: the transformer ships with deterministic unit tests against fixture INSTRUCTIONs.

Some commercial drug-drug-interaction databases (e.g. First DataBank, IBM Micromedex) expose FHIR APIs. v1.0's CDS rules don't depend on them; if a deployment integrates with such a database the call sequence becomes (a) translate active openEHR meds to FHIR `MedicationStatement`, (b) call the DDI API, (c) display the result. That's a v1.x integration.
