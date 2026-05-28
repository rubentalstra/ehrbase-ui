# Data Protection Impact Assessment (DPIA) — `ehrbase-ui` deployment

> **GDPR Art. 35 — mandatory before this UI touches real patient data.** EHR systems appear on every EU supervisory authority's list of processing operations that require a DPIA (NL AP, DE BfDI, FR CNIL, IT Garante, ES AEPD). Architecture-doc cross-references: [`architecture.md §14.10`](../architecture.md#1410-dpia--mandatory-before-go-live), [`§14.1`](../architecture.md#141-legal-framework), [`§14.12`](../architecture.md#1412-risk-rated-checklist).
>
> **This is a template.** Each deployment instantiates a copy under `docs/compliance/<deployment-slug>/DPIA.md`, fills the bracketed placeholders, has it reviewed by the DPO, and signs it off before go-live. Keep this template as the EU-baseline structure — never edit a deployment's signed copy in place; produce a new dated version.

---

## 0. Document control

| Field                              | Value                                                                                                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deployment                         | `[Hospital / clinic / research institute name]`                                                                                                                                   |
| Controller                         | `[Legal entity name, registered office]`                                                                                                                                          |
| Processor (operating this UI)      | `[Legal entity name]`                                                                                                                                                             |
| Sub-processors                     | `[List — see §6]`                                                                                                                                                                 |
| Competent supervisory authority    | `[NL AP / DE BfDI + Landesbeauftragte / FR CNIL / IT Garante / ES AEPD / PT CNPD / AT DSB / PL UODO / BE GBA / IE DPC / SE IMY / DK Datatilsynet / FI Tietosuojavaltuutettu / …]` |
| DPO contact                        | `[Name, email, phone, postal address]`                                                                                                                                            |
| `ehrbase-ui` version assessed      | `[Git tag — e.g. v1.0.0]`                                                                                                                                                         |
| Architecture-doc revision assessed | `[architecture.md vX.Y]`                                                                                                                                                          |
| First issue date                   | `[YYYY-MM-DD]`                                                                                                                                                                    |
| Last review date                   | `[YYYY-MM-DD]`                                                                                                                                                                    |
| Next review due                    | `[YYYY-MM-DD — at minimum yearly; sooner on material architecture change or new processing purpose]`                                                                              |
| Sign-off                           | `[Names + signatures: controller, DPO, processor lead, clinical lead]`                                                                                                            |

Triggers that force a fresh review (re-issue, not in-place edit):

- New processing purpose (e.g. adding research/secondary-use access).
- Material architecture change (new data store, new sub-processor, new cross-border transfer, AI features).
- New cross-border data flow or change in transfer mechanism.
- New class of data subject (e.g. paediatric, mental-health, genetic, occupational-health).
- Incident or near-miss that revealed a residual risk not previously captured.
- Regulatory change at EU or national level.

---

## 1. Description of the processing

### 1.1 Nature

`ehrbase-ui` is a clinical web UI in front of the EHRbase openEHR clinical-data repository. End users (clinicians, nurses, admin staff, audit reviewers, researchers) read and write patient records, audit logs, and supporting workflow data via a BFF that proxies authenticated traffic to EHRbase and a separate openEHR demographic service (ADR-0023).

Architecture summary: [`architecture.md §3`](../architecture.md#3-architecture-overview). BFF pattern: [`§5`](../architecture.md#5-authentication--bff-pattern). Audit-log envelope (NEN 7513:2024): [`§14.2`](../architecture.md#142-audit-log-schema-nen-75132024).

### 1.2 Scope

- **Data subjects.** `[Patients of the deployment; staff users; in-scope research participants if applicable.]`
- **Categories of personal data.** Identifiers (national patient ID, MRN), demographics (name, DOB, address, contact), special-category health data (Art. 9: diagnoses, medications, allergies, vitals, lab results, imaging metadata, clinical notes, discharge summaries), authentication metadata (user ID, role, session ID, IP, user-agent), audit events.
- **Special categories.** Health data (Art. 9(1)). `[Mark any additionally relevant: genetic / biometric / mental-health / sexual-health / data on minors / data on occupational-health subjects.]`
- **Volumes (estimated steady state).** `[N data subjects, M events/day, K GB/year cold-tier growth.]`
- **Geographic scope of processing.** `[EU / EEA member states involved.]` No transfers to third countries without an Art. 46 mechanism (see §6).

### 1.3 Context

- **Sector.** Healthcare delivery / research / public health.
- **Deployment setting.** `[Acute hospital / outpatient clinic / GP practice / research consortium / national registry / …]`
- **Lawful basis (Art. 9(2)).** Treatment paths rely on Art. 9(2)(h) (provision of healthcare). Emergency-access flow relies on Art. 9(2)(c) (vital interests). Research/secondary-use paths rely on Art. 9(2)(a) (explicit consent) — `[describe consent mechanism]` — or Art. 9(2)(i)/(j) where applicable.
- **National healthcare-records law.** `[NL Wabvpz + NEN 7510/7512/7513 + WGBO 20-year retention / DE §10 BO + §203 StGB / FR PGSSI-S + CSP L1110-4 / IT — applicable law from member state / ES — applicable law / …]`
- **Reasonable expectations of the data subject.** Patients expect their record to be visible to staff with a care relationship; "who accessed my record" disclosure is the counterpart, and is exposed via `/me/access-log` ([`§14.8`](../architecture.md#148-data-subject-rights--required-ui-features)).

### 1.4 Purposes

`[Enumerate per processing operation. Examples below — keep / strike per deployment.]`

| #   | Purpose                                 | Lawful basis (Art. 6 / Art. 9)                            | Categories of data                              |
| --- | --------------------------------------- | --------------------------------------------------------- | ----------------------------------------------- |
| P1  | Direct healthcare provision             | 6(1)(c) + 9(2)(h)                                         | Identifiers, demographics, health data          |
| P2  | Emergency clinical access (break-glass) | 6(1)(d) + 9(2)(c)                                         | Identifiers, demographics, health data          |
| P3  | Quality assurance + audit-log review    | 6(1)(c) + 9(2)(h) / (i)                                   | Audit events, pseudonymised patient identifiers |
| P4  | Research / secondary use                | 6(1)(a) + 9(2)(a) **or** 6(1)(e) + 9(2)(j)                | Pseudonymised health data                       |
| P5  | System administration                   | 6(1)(f) (controller's legitimate interest in IT security) | Auth events, session metadata                   |

---

## 2. Necessity and proportionality

### 2.1 Necessity

For each processing operation listed in §1.4, justify why the data is necessary and why a less-intrusive alternative would not satisfy the clinical/legal purpose. EHR processing is generally inherent to delivering treatment; the necessity argument focuses on **field-level minimisation**.

- `[Example: store HIV status only where treatment requires it; do not surface in unrelated record views — implemented via role-gated archetype-level access checks. See M11 problems list + M15 audit-review dashboard for surfacing-control implementation.]`

### 2.2 Proportionality

Demonstrate that the processing is the **least-intrusive** mechanism that achieves the purpose:

- **Data minimisation.** Per-field justification for any sensitive field surfaced beyond the obvious clinical use. Pseudonymisation of patient identifiers in audit logs (HMAC-SHA256, see [`§14.4`](../architecture.md#144-the-paradox--audit-logs-are-themselves-phi)) means audit-log access does not expose direct identifiers by default.
- **Purpose limitation.** Research/secondary-use access uses a separate role + an explicit consent record (`CONSENT_GRANT` audit event) — no implicit reuse of treatment-purpose data.
- **Storage limitation.** Retention configured per the deployment's national clinical-records law (default 20y clinical, 5y audit) per [`§14.7`](../architecture.md#147-retention--reconciling-gdpr-minimization-with-national-clinical-record-laws). Daily purge job removes records past their tagged retention.
- **Transparency.** Public `/accessibility` page + patient-facing `/me/access-log` view + record-portability export ([`§14.8`](../architecture.md#148-data-subject-rights--required-ui-features)).
- **No automated decision-making with legal effects** (Art. 22). CDS rules (ADR-0021) are decision-support advisory only — clinicians retain the final decision.

---

## 3. Risk identification

For each risk, state the threat scenario, the affected data subjects, the impact severity (1 = minor / 2 = significant / 3 = severe), the likelihood (1 = unlikely / 2 = possible / 3 = likely), and the residual risk after the mitigations in §4 are in place.

| #   | Threat                                                                                                             | Affected subjects          | Severity (1–3) | Likelihood (1–3) | Inherent risk | Mitigation (cross-ref §4)                                                                                     | Residual risk    |
| --- | ------------------------------------------------------------------------------------------------------------------ | -------------------------- | -------------- | ---------------- | ------------- | ------------------------------------------------------------------------------------------------------------- | ---------------- |
| R1  | Unauthorised access by staff outside care relationship                                                             | Patients                   | 3              | 2                | High          | M2 (RBAC + break-glass `[§5.6]`), M4 (audit + review), M15 (sample-of-60)                                     | `[Low / Medium]` |
| R2  | Bulk export of records for non-authorised purpose                                                                  | Patients                   | 3              | 1                | Medium        | §5.9 rate limit on AQL + export; CSV export emits dedicated audit event                                       | `[Low]`          |
| R3  | Audit-log tampering                                                                                                | Patients + staff           | 3              | 1                | Medium        | M2 hash chain (`§14.5`), DB-enforced append-only (ADR-0013), nightly integrity job (M4)                       | `[Low]`          |
| R4  | Loss of confidentiality at rest (DB breach)                                                                        | Patients                   | 3              | 1                | Medium        | TLS 1.3 in transit; encrypted backups; PHI pseudonymisation in logs; KMS-held secret for HMAC                 | `[Low]`          |
| R5  | Loss of availability — single-instance outage during clinical shift                                                | Patients (delayed care)    | 2              | 2                | Medium        | Stateless app + horizontal scaling; M18 backup/DR drill; break-glass paper fallback `[describe]`              | `[Low / Medium]` |
| R6  | PHI leakage into application logs or trace spans                                                                   | Patients                   | 2              | 2                | Medium        | Pino redaction filter; OTel four-layer span redaction (`§13.2`); ESLint `no-as-cast` rule                     | `[Low]`          |
| R7  | Sub-processor / cloud-provider access                                                                              | Patients                   | 3              | 1                | Medium        | EU/EEA-only providers; Art. 28 DPA with each sub-processor; KMS scoping; encryption with controller-held keys | `[Low]`          |
| R8  | Re-identification of pseudonymised audit subject IDs                                                               | Patients                   | 2              | 2                | Medium        | HMAC secret in KMS, separate trust boundary from audit-log store; `META_AUDIT_ACCESS` on every reveal         | `[Low]`          |
| R9  | Cross-border transfer to third country                                                                             | Patients                   | 2              | 1                | Low           | Art. 46 mechanism only — none configured by default; documented if controller adds a third-country processor  | `[Low]`          |
| R10 | Breach not detected / not notified within 72h                                                                      | Patients + regulator       | 3              | 1                | Medium        | Breach runbook (`runbooks/breach-response.md`); forensic AQL queries; DPO alert on audit chain break          | `[Low]`          |
| R11 | Inadequate accessibility excludes data subjects from exercising rights                                             | Patients with disabilities | 2              | 2                | Medium        | WCAG 2.2 AA + EAA + EN 301 549 (§12); axe automated + NVDA/VoiceOver manual passes (M18)                      | `[Low]`          |
| R12 | `[Add deployment-specific risks: e.g. paediatric data, occupational-health overlap, public-figure patients, etc.]` |                            |                |                  |               |                                                                                                               |                  |

---

## 4. Mitigations

Cross-link to the implementing milestone / ADR / runbook in every row.

| Mitigation                                                                        | Implementation                                     | Reference                |
| --------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------ |
| Server-only OIDC tokens (BFF)                                                     | M2 — OIDC callback + Valkey session                | `§5`, ADR-0002, ADR-0004 |
| RBAC with role-specific home routes                                               | M2 — `requireRole(...)`                            | `§5.6`, ADR-0017         |
| Break-glass emergency access, fully audited, 60-min grant, 3-per-lifetime ceiling | M2 — `break-glass.server.ts`                       | `§5.6`                   |
| NEN 7513:2024 audit envelope on every PHI touch                                   | M2 — `logAudit()` + BFF proxy                      | `§14.2`, `§14.3`         |
| Append-only audit DB at storage layer                                             | M2 migration — `audit_writer` role + trigger       | ADR-0013                 |
| Hash-chain tamper evidence + DPO alert on break                                   | M2 verifier + M4 nightly job                       | `§14.5`                  |
| Dual-layer audit (NEN 7513 + openEHR CONTRIBUTION)                                | M6 — every clinical write                          | ADR-0024                 |
| Pseudonymisation of patient IDs in logs                                           | M2 — HMAC-SHA256 with KMS-held secret              | `§14.4`                  |
| PHI never in error messages, logs, or trace spans                                 | App layout + redaction filters                     | `§10`, `§13.2`           |
| Cold-tier audit archive (WORM where supported)                                    | M4 — `cold-store.server.ts` + provider abstraction | ADR-0027                 |
| Configurable retention + daily purge job                                          | M4 — `retention.server.ts` + Nitro task            | `§14.7`, ADR-0026        |
| Patient-facing access-log view (Art. 15)                                          | M3 scaffold + M4 data feed                         | `§14.8`                  |
| Record portability export (openEHR JSON + FHIR)                                   | M6 / M16 export transformer                        | `§14.8`, ADR-0019        |
| Rate limiting on AQL + export                                                     | M2 — `rate-limiter-flexible`                       | `§5.9`                   |
| TLS 1.3, HSTS, CSP with nonce + strict-dynamic, COOP/COEP                         | M2 — security-headers middleware                   | `§5.7`                   |
| CSRF defence (Origin + per-form token)                                            | M2                                                 | `§5.8`                   |
| WCAG 2.2 AA + EAA + EN 301 549                                                    | M1 (lint) + M3 (focus) + M18 (manual)              | `§12`                    |
| Backup + DR drill                                                                 | M18 runbook                                        | `§21`                    |
| Breach response within 72h                                                        | `runbooks/breach-response.md`                      | `§14.9`                  |
| Audit-log integrity check                                                         | `runbooks/audit-log-integrity-check.md`            | `§14.5`, ADR-0013        |
| Sample-of-60 quarterly audit review                                               | M15 dashboard                                      | `§14.13`                 |

---

## 5. Data-subject rights — implementation

| Right                                     | Article | Surface                                                                                                                                                                                                         |
| ----------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access                                    | 15      | `/me/access-log` ("my own actions"; true patient-facing Art.15 over the demographic pseudonym lands in the v1.x patient portal) — see [`v1.x-roadmap.md`](../v1.x-roadmap.md). M4 ships the staff/user version. |
| Rectification                             | 16      | Edit composition produces a new version (openEHR `VERSIONED_OBJECT`); prior versions retained per ADR-0023.                                                                                                     |
| Erasure                                   | 17      | Generally **overridden** by national clinical-records retention (legal-obligation basis under Art. 6(1)(c)). Ancillary data (preferences, drafts) erasable. Document the decision and notify the patient.       |
| Restriction                               | 18      | "Lock record" flag — applies to ancillary use; clinical access for life-threatening situations still allowed under 9(2)(c).                                                                                     |
| Portability                               | 20      | Export canonical openEHR JSON + FHIR Bundle (M6 / M16).                                                                                                                                                         |
| Object                                    | 21      | Withdraw research/secondary-use consent — `CONSENT_WITHDRAW` audit event.                                                                                                                                       |
| No automated decisions with legal effects | 22      | CDS rules are advisory; human-in-the-loop.                                                                                                                                                                      |

---

## 6. Sub-processors and transfers

| Sub-processor                                       | Role              | Location          | Art. 28 DPA in place | Notes                                            |
| --------------------------------------------------- | ----------------- | ----------------- | -------------------- | ------------------------------------------------ |
| `[e.g. cloud hosting provider]`                     | Compute + storage | `[EU/EEA region]` | `[Yes — date]`       | `[Encryption key custody, key rotation cadence]` |
| `[Backup vendor]`                                   | Backup / DR       | `[EU/EEA region]` | `[Yes — date]`       |                                                  |
| `[Identity provider — if not self-hosted Keycloak]` | OIDC              | `[Region]`        | `[Yes — date]`       |                                                  |
| `[Add others]`                                      |                   |                   |                      |                                                  |

Third-country transfers: `[None / Art. 46 mechanism: SCCs + TIA / Adequacy decision — list per transfer]`.

---

## 7. Residual risk and consultation

- **Residual-risk summary.** `[After mitigations, the overall residual risk is assessed as Low / Medium / High.]`
- **High residual risks remaining.** `[List or "None". If any remain, GDPR Art. 36 prior consultation with the supervisory authority is required before processing begins.]`
- **Prior consultation under Art. 36.** `[Required: Yes / No. If yes, reference number + date of submission.]`

---

## 8. Review and update

- This DPIA is reviewed at minimum **annually**, and immediately on any of the triggers listed in §0.
- A diff against the prior version is filed; this is the audit trail that the DPIA stayed current.
- The next review date and the responsible reviewer are set explicitly in §0.

---

## 9. Approvals

| Role                      | Name | Signature | Date |
| ------------------------- | ---- | --------- | ---- |
| Controller representative |      |           |      |
| DPO                       |      |           |      |
| Processor lead            |      |           |      |
| Clinical lead             |      |           |      |
| `[Other: e.g. CISO]`      |      |           |      |
