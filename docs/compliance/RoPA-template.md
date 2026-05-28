# Records of Processing Activities (RoPA) — Art. 30 GDPR

> **GDPR Art. 30 — mandatory for the controller (and for the processor where applicable).** One entry per distinct processing activity, kept current and made available to the supervisory authority on request. Architecture-doc cross-references: [`architecture.md §14.1`](../architecture.md#141-legal-framework), [`§14.12`](../architecture.md#1412-risk-rated-checklist).
>
> **This is a template.** Each deployment instantiates a copy under `docs/compliance/<deployment-slug>/RoPA.md`, fills the entries below for its own processing activities, and reviews on every material change. Entries below describe the `ehrbase-ui` architecture-driven baseline; the deployment removes any not applicable and adds any local extras.

---

## Document control

| Field                                     | Value                              |
| ----------------------------------------- | ---------------------------------- |
| Deployment                                | `[Name]`                           |
| Maintained by (controller representative) | `[Name, role, contact]`            |
| Last full review                          | `[YYYY-MM-DD]`                     |
| Next full review due                      | `[YYYY-MM-DD — at minimum yearly]` |

Triggers that force a fresh review of the affected entries:

- New processing purpose or material change to an existing one.
- New category of data or new category of data subject.
- New recipient (sub-processor, regulator, partner organisation).
- New cross-border transfer or change in transfer mechanism.
- Retention change.

---

## How to use this template

1. Each `### Activity N` block is one RoPA entry. Renumber as you add or remove.
2. Mandatory Art. 30(1) fields for the controller are filled in every entry. Where the processor also keeps Art. 30(2) records, append the processor-side fields at the end of each entry (separate section).
3. Cross-link every "security measures" cell to the architecture section that implements the measure, so future architectural changes that weaken a measure are detectable in review.

---

### Activity 1 — Clinical record creation and access (direct healthcare)

| Field                              | Value                                                                                                                                                                                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activity ID                        | A1                                                                                                                                                                                                                                                                                                                  |
| Activity name                      | Clinical record creation, read, and update for direct healthcare provision                                                                                                                                                                                                                                          |
| Purpose                            | Diagnosis, treatment, care planning, care coordination                                                                                                                                                                                                                                                              |
| Lawful basis                       | Art. 6(1)(c) (legal obligation under national healthcare-records law) + Art. 9(2)(h) (provision of healthcare)                                                                                                                                                                                                      |
| Categories of data subjects        | Patients of the deployment                                                                                                                                                                                                                                                                                          |
| Categories of personal data        | National patient identifier; demographics (name, DOB, address, contact); special-category health data (Art. 9) — diagnoses, medications, allergies, vitals, lab results, imaging metadata, clinical notes, discharge summaries, immunisations                                                                       |
| Special category?                  | Yes — Art. 9(1) health data                                                                                                                                                                                                                                                                                         |
| Source of the data                 | The patient and the treating clinicians                                                                                                                                                                                                                                                                             |
| Recipients                         | Treating clinicians + nurses + ancillary care team (RBAC: `clinician`); audit reviewers (pseudonymised); `[any external recipients — referral targets, registries — list explicitly]`                                                                                                                               |
| Transfers to third country         | None by default                                                                                                                                                                                                                                                                                                     |
| Transfer mechanism (if applicable) | N/A — controller adds Art. 46 mechanism + TIA per added recipient                                                                                                                                                                                                                                                   |
| Retention                          | National clinical-records law (default 20y from last entry — configurable per the deployment's supervisory authority). See [`§14.7`](../architecture.md#147-retention--reconciling-gdpr-minimization-with-national-clinical-record-laws).                                                                           |
| Erasure mechanism                  | Largely overridden by retention legal obligation; ancillary data erasable.                                                                                                                                                                                                                                          |
| Security measures (Art. 32)        | OIDC + PKCE auth (`§5`), BFF (`§5`), RBAC (`§5.6`), break-glass (`§5.6`), TLS 1.3 + HSTS + CSP nonce (`§5.7`), rate limiting (`§5.9`), audit on every access (`§14`), pseudonymised subject IDs in logs (`§14.4`), encrypted-at-rest stores, WCAG 2.2 AA (`§12`), no PHI in errors / logs / spans (`§10`, `§13.2`). |
| DPIA reference                     | `DPIA.md` §3 R1, R2, R4, R6                                                                                                                                                                                                                                                                                         |

### Activity 2 — Emergency clinical access (break-glass)

| Field                       | Value                                                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Activity ID                 | A2                                                                                                                                 |
| Purpose                     | Time-critical clinical access where the standard care-relationship gate would block treatment                                      |
| Lawful basis                | Art. 6(1)(d) (vital interests of the data subject) + Art. 9(2)(c) (vital interests where the data subject is incapable of consent) |
| Categories of data subjects | Patients                                                                                                                           |
| Categories of personal data | As Activity 1                                                                                                                      |
| Special category?           | Yes — Art. 9(1)                                                                                                                    |
| Source                      | Treating clinicians at point of need                                                                                               |
| Recipients                  | Clinician invoking break-glass + audit reviewers                                                                                   |
| Transfers to third country  | None                                                                                                                               |
| Retention                   | Audit event retained per national audit-log retention (≥5y); the clinical data accessed is governed by Activity 1's retention.     |
| Security measures           | 60-min grant, 3-per-lifetime ceiling, mandatory justification, full audit, banner-level visibility in the patient view (`§5.6`).   |
| DPIA reference              | `DPIA.md` §3 R1                                                                                                                    |

### Activity 3 — Audit-log writing and storage (NEN 7513:2024)

| Field                       | Value                                                                                                                                                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activity ID                 | A3                                                                                                                                                                                                                                      |
| Purpose                     | Mandatory access logging for accountability, security monitoring, and detection of unauthorised access                                                                                                                                  |
| Lawful basis                | Art. 6(1)(c) (legal obligation: national healthcare-audit law; ISO 27799; NEN 7513 in NL) + Art. 9(2)(h) (necessary for the management of healthcare services)                                                                          |
| Categories of data subjects | Patients (as targets); staff users (as actors)                                                                                                                                                                                          |
| Categories of personal data | Actor (user ID, role, organisation); source (IP, user-agent, session ID); action; target (pseudonymised subject ID, resource type, archetype); purpose + lawful basis; outcome                                                          |
| Special category?           | Yes — by association (event records imply clinical context)                                                                                                                                                                             |
| Source                      | The application itself, on every PHI touch + every auth event                                                                                                                                                                           |
| Recipients                  | Audit reviewers (RBAC `audit-reviewer`); DPO on integrity-chain failure; supervisory authority on lawful request                                                                                                                        |
| Transfers to third country  | None                                                                                                                                                                                                                                    |
| Retention                   | National audit-log retention (default ≥5y configurable per [`§14.7`](../architecture.md#147-retention--reconciling-gdpr-minimization-with-national-clinical-record-laws)). Cold-tier archive per ADR-0027.                              |
| Erasure                     | Configurable purge job; pre-purge events archived to cold storage (WORM where supported).                                                                                                                                               |
| Security measures           | Pseudonymised patient identifiers (HMAC-SHA256 with KMS-held secret, `§14.4`); SHA-256 hash chain (`§14.5`); append-only DB at storage layer (ADR-0013); separate `audit_writer` role; nightly integrity job; DPO alert on chain break. |
| DPIA reference              | `DPIA.md` §3 R3, R8                                                                                                                                                                                                                     |

### Activity 4 — Authentication and session management

| Field                       | Value                                                                                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activity ID                 | A4                                                                                                                                                                                           |
| Purpose                     | Establish user identity, maintain session, support sign-out and session expiry                                                                                                               |
| Lawful basis                | Art. 6(1)(f) (legitimate interest in IT security) for staff users; Art. 6(1)(b) (contract / pre-contract) where the user is a patient on the v1.x portal                                     |
| Categories of data subjects | Staff users; (v1.x) patients using the patient portal                                                                                                                                        |
| Categories of personal data | User ID, username, display name, roles, session ID (internal, not the cookie value), IP address, user-agent, OIDC tokens (server-side only)                                                  |
| Special category?           | No (auth events are not Art. 9 data on their own, although the surrounding context can be)                                                                                                   |
| Source                      | Identity provider (Keycloak) and the user's browser                                                                                                                                          |
| Recipients                  | The application itself; audit log; IdP                                                                                                                                                       |
| Transfers to third country  | None by default                                                                                                                                                                              |
| Retention                   | Session: session lifetime + 24h. Auth logs: 1y (configurable). See [`§14.7`](../architecture.md#147-retention--reconciling-gdpr-minimization-with-national-clinical-record-laws).            |
| Security measures           | BFF (tokens server-side only); HttpOnly + Secure + SameSite=Lax cookies; idle 15-min + absolute 12h timeouts (`§5.5`, `§5.10`); CSRF defence (`§5.8`); rate-limited login attempts (`§5.9`). |
| DPIA reference              | `DPIA.md` §3 R1                                                                                                                                                                              |

### Activity 5 — Audit-log review (sample-of-60 quarterly)

| Field                       | Value                                                                                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activity ID                 | A5                                                                                                                                                                                            |
| Purpose                     | Detect and investigate unauthorised access; satisfy NEN 7513 review requirement                                                                                                               |
| Lawful basis                | Art. 6(1)(c) (legal obligation: national audit-log review rules) + Art. 9(2)(h)                                                                                                               |
| Categories of data subjects | Patients (pseudonymised by default; revealable with `META_AUDIT_ACCESS` event); staff users (actors under review)                                                                             |
| Categories of personal data | Audit events as recorded in A3                                                                                                                                                                |
| Special category?           | Yes — by association                                                                                                                                                                          |
| Recipients                  | Audit reviewers; DPO on escalation                                                                                                                                                            |
| Retention                   | Same as A3                                                                                                                                                                                    |
| Security measures           | Pseudonymised by default in the dashboard; explicit "reveal" emits its own audit event; sample-of-60 cadence; designated reviewer (separation of duties — reviewer ≠ logged user) (`§14.13`). |
| DPIA reference              | `DPIA.md` §3 R1                                                                                                                                                                               |

### Activity 6 — Application logs (non-audit) and observability

| Field                       | Value                                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Activity ID                 | A6                                                                                                                                       |
| Purpose                     | Detect and diagnose application errors and security events                                                                               |
| Lawful basis                | Art. 6(1)(f) (IT security, operational reliability)                                                                                      |
| Categories of data subjects | Staff users (the actors whose actions emit errors)                                                                                       |
| Categories of personal data | Correlation ID; coarse-grained action; no PHI                                                                                            |
| Special category?           | No — PHI redaction enforced                                                                                                              |
| Source                      | The application itself                                                                                                                   |
| Recipients                  | Operations team; the M5 observability stack (Loki + Tempo + Prometheus)                                                                  |
| Retention                   | 90 days (configurable per [`§14.7`](../architecture.md#147-retention--reconciling-gdpr-minimization-with-national-clinical-record-laws)) |
| Security measures           | Pino redaction filter; OTel four-layer trace-span redaction (`§13.2`); EU-only collector endpoints.                                      |
| DPIA reference              | `DPIA.md` §3 R6                                                                                                                          |

### Activity 7 — Demographic service (ADR-0023)

| Field                       | Value                                                                                                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activity ID                 | A7                                                                                                                                                                                                    |
| Purpose                     | Maintain `PARTY` records (PERSON, IDENTITY, CONTACT, ADDRESS) for patients separately from EHR compositions, per openEHR EHR/Demographic separation                                                   |
| Lawful basis                | As Activity 1 (treatment-purpose access)                                                                                                                                                              |
| Categories of data subjects | Patients; care-relationship contacts where recorded                                                                                                                                                   |
| Categories of personal data | National patient identifier; name; DOB; sex; address; contact details; preferred-language flag                                                                                                        |
| Special category?           | No (the demographic record by itself is not Art. 9 data, but is the de-anonymisation key for everything else)                                                                                         |
| Recipients                  | The application; the audit log (as `PARTY` resource references)                                                                                                                                       |
| Retention                   | Tied to A1 — kept while the clinical record exists, deleted with it.                                                                                                                                  |
| Security measures           | Own Postgres schema with `demographic_owner` + `demographic_writer` roles (ADR-0013 pattern, ADR-0023); HMAC pseudonymisation of the national identifier when copied into audit logs (`§14.4`); RBAC. |
| DPIA reference              | `DPIA.md` §3 R8                                                                                                                                                                                       |

### Activity 8 — Research / secondary use `[strike if not applicable]`

| Field                       | Value                                                                                                                                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activity ID                 | A8                                                                                                                                                                                                                    |
| Purpose                     | Secondary use of pseudonymised health data for research projects approved by the deployment's research governance board                                                                                               |
| Lawful basis                | Art. 6(1)(a) + Art. 9(2)(a) (explicit consent) **or** Art. 6(1)(e) + Art. 9(2)(j) (public-interest research) — `[document choice]`                                                                                    |
| Categories of data subjects | Patients who have consented (or, under (j), whose records are pseudonymised and within the research-framework scope)                                                                                                  |
| Categories of personal data | Pseudonymised health data as approved by the project                                                                                                                                                                  |
| Special category?           | Yes (pseudonymised, not anonymised)                                                                                                                                                                                   |
| Recipients                  | Approved researchers (RBAC `researcher`); research project lead                                                                                                                                                       |
| Transfers to third country  | `[Document per project — Art. 46 mechanism + TIA required]`                                                                                                                                                           |
| Retention                   | Per the research-project protocol (typically 5–10y post-publication; reference the approved protocol)                                                                                                                 |
| Security measures           | RBAC `researcher` separate from clinical roles; AQL editor with strict rate limits (`§5.9`); export emits a dedicated `AUDIT_EXPORTED` event; consent recorded as `CONSENT_GRANT` audit event with project reference. |
| DPIA reference              | `DPIA.md` §3 R2                                                                                                                                                                                                       |

### Activity 9 — Patient-facing record access `[v1.x — patient portal]`

| Field                       | Value                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Activity ID                 | A9                                                                                                                                   |
| Purpose                     | Provide the patient with read access to their own clinical record and audit trail (Art. 15)                                          |
| Lawful basis                | Art. 6(1)(c) (legal obligation under Art. 15) + Art. 9(2)(h)                                                                         |
| Categories of data subjects | Patients of the deployment                                                                                                           |
| Categories of personal data | The patient's own record and audit trail                                                                                             |
| Special category?           | Yes                                                                                                                                  |
| Recipients                  | The patient (and authorised legal representative where applicable)                                                                   |
| Retention                   | Tied to A1                                                                                                                           |
| Security measures           | Patient OIDC flow; `META_AUDIT_ACCESS` event on every read; record-portability export — see [`v1.x-roadmap.md`](../v1.x-roadmap.md). |
| DPIA reference              | `DPIA.md` §3 R1, R8                                                                                                                  |

---

## Processor-side Art. 30(2) records `[fill if the operating party is a separate processor]`

For each Activity above, the processor records:

- Name and contact details of each controller on behalf of whom the processor acts (and of the processor's representative if any).
- Categories of processing carried out on behalf of each controller (mirrors Activities above by ID).
- Transfers of personal data to a third country or international organisation, including their identification and, where applicable, the suitable safeguards under Art. 46.
- A general description of the technical and organisational security measures (mirrors the `Security measures` cells above).
