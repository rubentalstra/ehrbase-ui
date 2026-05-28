# ADR-0023 — Demographic service: separate openEHR-spec service alongside EHRbase

- **Status:** Accepted
- **Date:** 2026-05-28
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

The openEHR base architecture overview is explicit:

> "One of the basic principles of openEHR is the complete separation of EHR and demographic information, such that an EHR taken in isolation contains little or no clue as to the identity of the patient it belongs to."

Compositions reference subjects via `PARTY_PROXY` / `PARTY_SELF` / `PARTY_IDENTIFIED` (with `external_ref.id.namespace + value`) — **references** into a demographic store, NOT the demographic data itself.

**EHRbase implements only the EHR side.** Its REST API (ITS-REST Release 1.0.3, 19 Dec 2022) exposes:

- `/ehr` — create/manage EHRs
- `/ehr/{id}/composition` — compositions
- `/ehr/{id}/directory`, `/ehr/{id}/contribution`, `/ehr/{id}/ehr_status`
- `/query/aql` — AQL queries
- `/definition/template/*` — operational templates
- `/admin/*` — admin operations

No `/demographic/*` endpoint. EHRbase does not implement the openEHR Demographic Information Model.

For our patient banner (M8), problem list, vitals etc. we need name / DOB / sex / MRN / pseudonymised national-ID — i.e. PERSON + PARTY_IDENTITY + CONTACT + ADDRESS.

Three options (presented to user, planning round 2, decision #9):

- **A** — minimal demographics in our app Postgres with a PARTY_IDENTIFIED-shaped adapter.
- **B** — Integrate an external Patient Master Index via HL7 v2 ADT feeds (production hospital pattern).
- **C** — Run a separate openEHR-spec demographic service alongside EHRbase.

User chose **C** — most spec-pure.

## Decision

**v1.0 ships an openEHR-spec demographic service as a module in this app.** Own Postgres schema, own REST surface (`/api/demographic/*`), implementing the openEHR Demographic Information Model classes:

- `PARTY` (abstract) → `PERSON` (concrete, the main one), `ORGANISATION`, `GROUP`, `AGENT`
- `ROLE` (with `time_validity`, `performer` PARTY_REF, `capabilities`)
- `PARTY_IDENTITY` (with `details` ITEM_STRUCTURE — name + ID variants)
- `CONTACT` (with `addresses` + `time_validity`)
- `ADDRESS`
- `PARTY_RELATIONSHIP`
- `CAPABILITY`

**REST surface** — modelled on `ITS-REST Release 1.0.3`'s shape but for demographic resources:

- `GET /api/demographic/party/{id}` — fetch a PARTY by internal ID
- `GET /api/demographic/party?identifier_namespace=...&identifier_value=...` — fetch by external identifier (e.g. national patient ID + namespace)
- `POST /api/demographic/party` — create
- `PUT /api/demographic/party/{id}` — update (versioned via openEHR `VERSIONED_OBJECT` semantics)
- `GET /api/demographic/party/{id}/identities`, `/contacts`, `/relationships`

**Cross-reference into EHRbase.** Each `PARTY_IDENTITY.details` carries the external identifiers (NL: BSN, BE: NISS, FR: NIR, DE: KVNR, IT: Codice Fiscale, ES: TIS, PT: NUTS, AT: bPK, PL: PESEL, plus MRN — `PARTY_IDENTITY` supports multiple identifier types in `details`). When the EHR is created in EHRbase, its `EHR_STATUS.subject` is set to a `PARTY_IDENTIFIED` with `external_ref.namespace = <country_pid_namespace>` + `external_ref.id.value = <pseudonymised_id_or_pid>`.

**Storage.** Postgres schema `demographic` (separate from `audit` per ADR-0013 + `app` for sessions). Two Postgres roles: `demographic_owner` (migrations only) + `demographic_writer` (runtime, INSERT + SELECT + UPDATE on PARTY-shaped tables). Backups encrypted.

**Pseudonymisation.** The national patient ID stored is `HMAC-SHA256(rawId, secret)` — same pattern as audit subject pseudonymisation (§14.4). The original raw ID is held only by whichever upstream PMI feeds us (or by the deployment's external mapping table if there's no PMI). Per ADR-0024 the **same secret** is used for audit subject hashing + demographic identifier hashing so the two stores cross-link without a third lookup.

**Auth.** `/api/demographic/*` is gated by `requireRole('clinician')` (same as EHRbase access). Reads are NEN-7513 audited (action=READ, resourceType=`PARTY`).

**Versioning.** PARTY records are versioned per openEHR's `VERSIONED_OBJECT` semantics — every update creates a new version; the prior version is preserved. Both versions readable by ID + version.

## Consequences

**Positive.** Strict openEHR spec compliance. The clean EHR/Demographic separation the spec mandates is preserved physically (separate schema) + logically (separate REST namespace). Adapter contract is openEHR-PARTY-shaped, so a future PMI integration (v1.x — `docs/v1.x-roadmap.md`) plugs in via the same surface: the deployment swaps the data source (PMI sync job populates the demographic store) without changing UI code.

**Negative.** Building the demographic service is a whole milestone (M7). Cost: full implementation of PARTY hierarchy + versioning + REST surface + admin UI for clinician demographic entry. Mitigation: we implement the _minimum_ class hierarchy v1.0 needs (PERSON, PARTY_IDENTITY, CONTACT, ADDRESS, basic PARTY_RELATIONSHIP for clinician-patient) and defer ORGANISATION / GROUP / AGENT to v1.x.

There is no widely-deployed open-source reference implementation of the openEHR Demographic Information Model — we're building a small one. Mitigation: the scope is narrow (~5 classes, 4 endpoints). The openEHR Foundation's archetypes for demographic entities (`openEHR-DEMOGRAPHIC-*` namespace on CKM) give us validated schemas to constrain against.
