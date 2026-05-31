# AQL Query Catalogue

> Every AQL query the UI runs at runtime is **named, parameterised, version-pinned, and listed here.** No free-form AQL leaves the browser; clinicians who need ad-hoc AQL use the M14 power-user editor, which still validates against the same parser. Drift between the runtime catalogue and this doc is a release blocker.

The catalogue is **also a code artefact** — `src/lib/aql/catalogue.ts` exports the same set of named queries the BFF evaluates. This doc is the human-readable index. They must match.

AQL spec version: **Release 1.1.0** (`specifications.openehr.org/releases/QUERY/Release-1.1.0`). Parameter syntax: `$param` (EHRbase-confirmed).

## Conventions

- **Query name:** `surface_intent` — e.g. `vitals_latest_blood_pressure`. Stable identifier referenced by the BFF and the UI surfaces.
- **Parameters:** documented inline. All parameters are bound from authenticated context (`ehr_id` from the route, `since` from the UI) — none can come unsanitised from query strings.

---

## Catalogue (filled in as each milestone lands)

### Patient core (M8)

- `patient_summary_header` — fetch the data backing the patient banner (active allergies count, active problems count, latest critical alert). Parameters: `$ehr_id`.
- `patient_encounters_recent` — list the last `$limit` encounters (compositions categorised as event), grouped by `DIRECTORY/FOLDER`. Parameters: `$ehr_id`, `$limit` (default 20).

### Vitals + labs (M9)

- `vitals_latest_blood_pressure` — most recent `openEHR-EHR-OBSERVATION.blood_pressure.v2`. Parameters: `$ehr_id`.
- `vitals_trend_blood_pressure` — last `$limit` readings ordered descending. Parameters: `$ehr_id`, `$limit`.
- `vitals_latest_pulse` / `_temperature` / `_respiration` / `_pulse_oximetry` / `_body_weight` — one query per archetype, same shape.
- `labs_recent_results` — last `$limit` `openEHR-EHR-OBSERVATION.laboratory_test_result.v1` with abnormal-flag derivation. Parameters: `$ehr_id`, `$since`, `$limit`.
- `labs_results_by_loinc` — labs filtered by LOINC code. Parameters: `$ehr_id`, `$loinc_code`, `$since`.

### Clinical notes (M10)

- `notes_recent_compositions` — last `$limit` compositions categorised as event with associated `EVALUATION.clinical_synopsis`. Parameters: `$ehr_id`, `$limit`.

### Problems / meds / allergies / immunisations (M11)

- `problems_active` — all `openEHR-EHR-EVALUATION.problem_diagnosis.v1` where status is active. Parameters: `$ehr_id`.
- `problems_history` — all problems including resolved, ordered by onset date. Parameters: `$ehr_id`.
- `medications_active` — active medication orders (`INSTRUCTION.medication_order.v3` with no end_date or end_date > today). Parameters: `$ehr_id`.
- `medication_administrations_recent` — `ACTION.medication.v1` records for the last `$limit` administrations. Parameters: `$ehr_id`, `$limit`.
- `allergies_active` — `openEHR-EHR-EVALUATION.adverse_reaction_risk.v1`. Parameters: `$ehr_id`.
- `immunisations_history` — all `openEHR-EHR-ACTION.immunisation.v1`. Parameters: `$ehr_id`.

### Orders / CPOE (M12)

- `orders_pending` — INSTRUCTION compositions with no matching ACTION (status = pending). Parameters: `$ehr_id`, `$order_type` (medication/lab/imaging).
- `orders_recent_completed` — INSTRUCTION + matching ACTION pairs, ordered by completion time. Parameters: `$ehr_id`, `$limit`.

### Care plan + tasks (M13)

- `care_plan_active_tasks` — WORK_PLAN / TASK_PLAN / PLAN_ITEM where status is active. Parameters: `$ehr_id`, `$assignee` (clinician id or null for all).
- `care_plan_tasks_overdue` — same as above but where `expiry_time` < now and ACTION absent. Parameters: `$ehr_id`.

### Discharge + referrals (M16)

- `discharge_compositions_recent` — `openEHR-EHR-COMPOSITION.discharge_summary.v1` ordered by composition `context/end_time`. Parameters: `$ehr_id`, `$limit`.

---

## Schema for the runtime JSON

Each entry in `src/lib/aql/catalogue.ts` exports:

```ts
{
  name: 'vitals_latest_blood_pressure',
  description: 'Most recent blood-pressure observation for the patient.',
  parameters: { ehr_id: 'uuid' },
  aql: `SELECT bp/data[at0001]/events[at0006] FROM EHR[ehr_id/value=$ehr_id] CONTAINS COMPOSITION CONTAINS OBSERVATION bp[openEHR-EHR-OBSERVATION.blood_pressure.v2]`,
  consumedBy: ['/_authed/patients/$patientId/vitals'],
}
```

The BFF runs each named query through EHRbase's `/query/aql` endpoint, validates parameters before substitution, and rate-limits per the §5.9 table.
