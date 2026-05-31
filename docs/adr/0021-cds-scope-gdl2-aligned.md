# ADR-0021 — CDS scope: GDL2-aligned native rule evaluator at the BFF

- **Status:** Accepted
- **Date:** 2026-05-28
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

Clinical Decision Support (CDS) is necessary for any modern EPD — at minimum, drug-allergy interaction checks, drug-drug interactions, and dose-range contraindications fire at order-write time. openEHR has a formal CDS specification: **GDL2 (Guideline Definition Language v2)**, Release 2.0.1 at `specifications.openehr.org/releases/CDS/Release-2.0.1`. GDL2 rules bind to archetype paths via `data_bindings`, declare `pre_conditions`, and emit `actions`.

Three implementation paths:

1. **Embedded GDL2 engine** — embed a full GDL2 execution engine in the BFF. Production-grade open-source GDL2 engines aren't readily available; the commercial ones (Marand, Better) aren't licence-compatible.
2. **External GDL2 service** — call out to a third-party GDL2 service per write. Same licensing issue + adds a network hop and an external dependency.
3. **Native rule evaluator, GDL2-aligned format** — build a small native evaluator in the BFF that reads rules in a **GDL2-aligned internal format** (same conceptual shape — archetype binding + pre-conditions + actions — without implementing full GDL2 semantics).

User decision (planning round 2, decision #7): **option 3 for v1.0**. The GDL2-aligned native evaluator is forward-compatible: when ecosystem GDL2 tooling matures, the rules port mechanically.

## Decision

**v1.0 ships a native rule evaluator in the BFF.** Rules are stored as JSON in our app DB and authored via the M15 CDS rule-authoring UI. Format is **GDL2-aligned** but not GDL2-compliant:

```ts
type CdsRule = {
  id: string // stable identifier; audited
  name: string // m.* key for display
  active: boolean
  severity: 'info' | 'warning' | 'critical'
  bindings: {
    // GDL2 data_bindings pattern
    [variableName: string]: {
      archetypeId: string // e.g. 'openEHR-EHR-EVALUATION.adverse_reaction_risk.v1'
      path: string // archetype-relative path
    }
  }
  preconditions: string[] // simple boolean expressions over bound variables
  actions: {
    alert: { message: string } // shown to clinician
    dismissibleWithJustification: boolean
  }[]
}
```

**Trigger points.** The evaluator runs at composition write time in the BFF — before forwarding to EHRbase:

1. The new composition's FLAT JSON is parsed.
2. Each active rule's bindings are resolved against the patient's existing record (via cached AQL queries from `docs/aql-catalogue.md`) + the incoming composition.
3. Pre-conditions evaluated; matching rules fire their action.
4. If a rule fires `severity: critical`, the write is blocked until the clinician dismisses with justification (recorded as an audit-log entry — `CDS_OVERRIDE` action — and a sidecar EVALUATION composition documenting the override).
5. `info` / `warning` alerts fire but don't block.

**v1.0 baseline rules** (target ~10):

- `cds_001_drug_allergy_match` — new INSTRUCTION.medication_order matches an active EVALUATION.adverse_reaction_risk.
- `cds_002_drug_drug_interaction` — only fires when a drug-knowledge base is configured (DRUGBANK / First DataBank / national source); v1.0 ships a tiny built-in table of the top-20 high-severity pairs as a default.
- `cds_003_renal_dose_adjust` — new nephrotoxic medication + elevated creatinine in recent labs.
- `cds_004_paediatric_weight_required` — new medication order on a patient <18 without a recent body_weight observation.
- `cds_005_critical_bp` — vitals write where systolic >180 or diastolic >120.
- `cds_006_critical_lab` — lab result outside critical thresholds (per LOINC code).
- `cds_007_duplicate_order` — new order matches an existing pending order for the same archetype within 24 h.
- `cds_008_anticoagulant_inr` — new anticoagulant order without a recent INR.
- `cds_009_pregnancy_contraindication` — teratogenic medication on a patient flagged pregnant.
- `cds_010_allergy_severity_unknown` — write an allergy with severity = "unknown" → suggest follow-up.

The exact set is reviewed when M15 implements rule authoring.

**No AI / LLM in v1.0.** GDPR Art. 22 (automated decision-making) + EU AI Act considerations defer LLM-based CDS to v1.x with a separate DPIA addendum.

**Audit on CDS overrides** (mechanism updated by [ADR-0041](0041-audit-access-governance.md), which supersedes the ADR-0024 dual-layer). A clinician dismissing a critical CDS alert produces:

1. An IHE ATNA access event via the BFF `auditAccess(...)` (the override + purpose recorded) → the Postgres `audit` schema — the access trail.
2. An EVALUATION composition `openEHR-EHR-EVALUATION.cds_override.v0` (or a national variant if defined) recording the rule ID + the justification text + the clinician, signed with an `ATTESTATION` — the openEHR data-lineage layer.

## Consequences

**Positive.** Deterministic, auditable, dismissible-with-justification CDS that ships in v1.0. Rule authoring UI exists, so non-engineers (clinical informaticists) can add rules. No external dependency; no per-write network hop. Format is forward-compatible with real GDL2.

**Negative.** Not full GDL2 semantics — complex rules (cross-archetype evaluations, temporal reasoning beyond simple "recent") might not fit the simplified format. Mitigation: M15 review of the baseline rules calibrates whether the format needs extension before v1.0 tag. The escape hatch is "if it's too complex for the JSON format, raise an issue to upgrade to a real GDL2 engine in v1.x."

The built-in drug-drug table (`cds_002`) is tiny by design — it covers the most-severe pairs as a safety floor, not a comprehensive interaction database. Deployments needing comprehensive coverage configure an external knowledge source (documented in the deployment guide; the API contract is provided in M15).

---

## Addendum 2026-05-29 — CDS infrastructure consolidated into new M9 milestone

Originally the CDS work was split across three milestones: the rule **wired** at vitals write (old M9), the rule **authoring UI** (old M15), and the runtime **evaluator + dismiss-with-justification** flow (old M16). Per CLAUDE.md Inviolable rule 13 (no minimal-now/full-later splits), the entire CDS feature — rule schema, authoring UI, runtime evaluator at the BFF, generic dismiss-with-justification flow, and the initial 10-rule pack listed above — consolidates into a **new milestone M9** that lands BEFORE any clinical write surface (M10+). The total v1.0 milestone count grows from 18 to 19 (see `docs/IMPLEMENTATION_CHECKLIST.md`). Subsequent clinical milestones (M10 vitals/labs, M11 notes, M12 problems/meds/allergies, M13 orders/CPOE) wire their archetype-specific rules to the M9 runtime — no per-milestone re-implementation of dismiss flow.
