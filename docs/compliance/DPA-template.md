# Data Processing Agreement (DPA) — controller ↔ processor

> **GDPR Art. 28 — mandatory before the processor (the operator of this `ehrbase-ui` deployment) touches any personal data on behalf of the controller (the healthcare organisation).** Architecture-doc cross-references: [`architecture.md §14.1`](../architecture.md#141-legal-framework), [`§14.12`](../architecture.md#1412-risk-rated-checklist) item #6.
>
> **This is a template.** It does not replace legal review. Each deployment instantiates a copy under `docs/compliance/<deployment-slug>/DPA.md`, has it adapted by counsel, signed by both parties, and dated. The template tracks the EU-baseline structure; national overlays go into Annex C.

---

## Parties

**Controller**

- Legal name: `[Hospital / clinic / research institute legal entity]`
- Registered office: `[Address]`
- Registered number: `[Chamber of commerce / corporate-registry number]`
- Represented by: `[Name, role]`
- DPO contact: `[Name, email, phone, postal address]`

**Processor**

- Legal name: `[Operating entity]`
- Registered office: `[Address]`
- Registered number: `[…]`
- Represented by: `[Name, role]`
- DPO / privacy contact: `[Name, email]`

Each a "Party", together the "Parties".

---

## 1. Subject matter and duration

1.1 **Subject matter.** Processing of personal data — including special-category health data under GDPR Art. 9 — required for the Controller's use of the `ehrbase-ui` clinical application and its supporting infrastructure (BFF, openEHR demographic service, audit DB, session store, observability stack).

1.2 **Duration.** This Agreement enters into force on `[date]` and remains in force for the duration of the underlying service contract, plus the time required to return or destroy personal data per §11.

---

## 2. Nature and purpose of the processing

2.1 **Nature.** Hosting, processing, transmission, and storage of personal data by the Processor on behalf of the Controller, for the purposes set out in 2.2.

2.2 **Purposes.**

- P1 — direct healthcare provision (Art. 9(2)(h)).
- P2 — emergency clinical access / break-glass (Art. 9(2)(c)).
- P3 — quality assurance and audit-log review (Art. 9(2)(h) / (i)).
- P4 — research / secondary use (only on the basis of explicit consent under Art. 9(2)(a), or Art. 9(2)(j) for the deployment's research framework). `[Strike if not applicable.]`
- P5 — system administration and IT security (Art. 6(1)(f) for staff-administrative data only).

The Processor will not process personal data for any other purpose, except as required by Union or Member-State law to which it is subject; in that case the Processor will inform the Controller before such processing, unless that law prohibits such information on important grounds of public interest.

---

## 3. Categories of data subjects and personal data

3.1 **Data subjects.** Patients of the Controller; staff users (clinicians, nurses, administrators, audit reviewers, researchers); legal representatives of patients where applicable.

3.2 **Categories of personal data.**

- Identifiers: national patient identifier (`[BSN / NISS / NIR / KVNR / CF / TIS / NUTS / bPK / PESEL / MRN / …]`), MRN, name, date of birth, address, contact details.
- Special-category health data (Art. 9): diagnoses, medications, allergies, vitals, lab results, imaging metadata, clinical notes, discharge summaries, immunisations.
- Authentication and session metadata: user ID, role, session ID, IP, user-agent, audit events.
- `[Add or strike: genetic, biometric, mental-health, sexual-health, paediatric, occupational-health.]`

---

## 4. Processor instructions

4.1 The Processor processes personal data **only on documented instructions** from the Controller, including with regard to transfers of personal data to a third country or an international organisation, unless required to do so by Union or Member-State law to which the Processor is subject. The standing instruction is to operate the application per the technical architecture documented in [`architecture.md`](../architecture.md).

4.2 The Processor immediately informs the Controller if, in its opinion, an instruction infringes GDPR or other Union / Member-State data-protection law.

---

## 5. Confidentiality

5.1 The Processor ensures that persons authorised to process personal data have committed themselves to confidentiality or are under an appropriate statutory obligation of confidentiality.

5.2 Access to personal data is restricted to personnel with a need-to-know for the agreed purposes. The Processor maintains role-based access controls (per [`§5.6`](../architecture.md#56-roles-authorization--break-glass-emergency-access)) and logs every access via the NEN 7513:2024 audit envelope ([`§14.2`](../architecture.md#142-audit-log-schema-nen-75132024)).

---

## 6. Security measures (Art. 32)

The Processor implements the following technical and organisational measures:

| Domain                       | Measure                                                                                                                                                                     | Architecture reference  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **Transport**                | TLS 1.3, HSTS preloaded, certificate management with `[CA / issuer]`                                                                                                        | `§5.7`                  |
| **Storage**                  | Encryption at rest on every store (Postgres, Valkey, cold-tier object storage)                                                                                              | `§14.6`                 |
| **Authentication**           | OIDC + PKCE via the Controller's IdP or self-hosted Keycloak (CVE-floor pinned per `CLAUDE.md`); BFF pattern keeps tokens server-side                                       | `§5`, ADR-0002          |
| **Authorisation**            | RBAC with `clinician / admin / audit-reviewer / researcher`; break-glass under Art. 9(2)(c) with 60-min grant and 3/lifetime cap, fully audited                             | `§5.6`                  |
| **Audit logging**            | NEN 7513:2024 envelope on every PHI touch; pseudonymised subject IDs in logs (HMAC-SHA256 with KMS-held secret); append-only DB enforced at the storage layer               | `§14`, ADR-0013         |
| **Tamper evidence**          | SHA-256 hash chain across the audit log; nightly integrity verifier with DPO alert on break                                                                                 | `§14.5`                 |
| **Cold-tier**                | WORM Object Lock where supported (AWS S3) / best-effort durable archive otherwise; the warm Postgres tier with the ADR-0013 trigger is the authoritative immutability layer | ADR-0027                |
| **Retention**                | Configurable per the Controller's national clinical-records law; daily purge job; defaults 20y clinical / 5y audit / 1y auth / 90d app / 2d session                         | `§14.7`                 |
| **Network**                  | Egress restricted to the Controller-approved sub-processors; no third-country transfer without an Art. 46 mechanism                                                         | §6 of this DPA, Annex B |
| **Backup + DR**              | `[Cadence — e.g. daily incremental + weekly full]`; encrypted at rest; periodic restore drill                                                                               | M18 runbook             |
| **Vulnerability management** | Dependabot + dependency-review + CodeQL on every PR; CVE-floor list per `CLAUDE.md` rule 5                                                                                  | `§17`, `§20`            |
| **Supply chain**             | Exact-version pinning of every dependency; SHA-pinned GitHub Actions; no `:latest` Docker tags                                                                              | `§5.12`, `§17`          |
| **Logging — non-audit**      | Pino redaction filter; OTel four-layer span redaction; 90-day retention on app logs                                                                                         | `§13`                   |
| **Accessibility**            | WCAG 2.2 AA + EAA + EN 301 549                                                                                                                                              | `§12`                   |
| **PHI in errors**            | Conflated 404/403; PHI never in error messages, logs, or trace spans                                                                                                        | `§10`, `§13.2`          |

The Processor reviews these measures at least annually and on any material change to the architecture, and notifies the Controller of any change that materially weakens them.

---

## 7. Sub-processors

7.1 **General authorisation.** The Controller hereby gives a general authorisation to engage sub-processors, subject to the conditions in this section.

7.2 **Current sub-processors** are listed in **Annex B**. The Processor maintains Annex B as the authoritative list.

7.3 **Adding or replacing a sub-processor.** The Processor gives the Controller at least **30 days'** prior written notice of any intended addition or replacement, allowing the Controller to object on reasonable grounds related to data protection. If the Controller objects, the Parties will negotiate in good faith; if no resolution is reached, either Party may terminate the affected part of the service.

7.4 **Sub-processor contract terms.** The Processor imposes on each sub-processor data-protection obligations no less protective than those in this DPA, by way of contract or other legal act under Union / Member-State law, including the obligations in Art. 28(3) GDPR.

7.5 **Liability for sub-processors.** Where a sub-processor fails to fulfil its data-protection obligations, the Processor remains fully liable to the Controller for the performance of that sub-processor's obligations.

---

## 8. International transfers

8.1 The Processor will not transfer personal data to a third country or an international organisation without the Controller's documented authorisation and an appropriate Art. 46 transfer mechanism (Standard Contractual Clauses + Transfer Impact Assessment, adequacy decision, or other lawful mechanism).

8.2 The default operating posture is **EU/EEA-only** processing — no transfers configured by default.

8.3 Any approved transfers, the mechanism, and the TIA outcome are listed in **Annex B**.

---

## 9. Data-subject requests (Art. 12–22)

9.1 Taking into account the nature of the processing, the Processor assists the Controller by appropriate technical and organisational measures, insofar as possible, for the fulfilment of the Controller's obligation to respond to requests for exercising the data subject's rights laid down in Chapter III of GDPR.

9.2 Specific support provided by the application:

| Right              | Surface                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Access (15)        | `/me/access-log` view; controller can export the user's full audit trail via the `audit-reviewer` admin surface (M15). |
| Rectification (16) | Composition edits produce new versions; controller resolves which version is authoritative.                            |
| Erasure (17)       | Largely overridden by national clinical-records retention; ancillary data erasable via admin tooling.                  |
| Restriction (18)   | "Lock record" flag.                                                                                                    |
| Portability (20)   | openEHR canonical JSON + FHIR Bundle export.                                                                           |
| Object (21)        | Consent withdrawal endpoint.                                                                                           |

9.3 The Processor forwards any request received directly from a data subject to the Controller within **`[SLA — typically 2 working days]`** and does not respond to the data subject unless instructed by the Controller.

---

## 10. Breach notification (Art. 33)

10.1 The Processor notifies the Controller **without undue delay and in any event no later than 24 hours** after becoming aware of a personal-data breach. (The 24-hour processor-to-controller SLA preserves the Controller's 72-hour SLA to the supervisory authority under Art. 33(1).)

10.2 The notification includes, to the extent known at the time:

- Nature of the breach, including categories and approximate numbers of data subjects and records concerned.
- Likely consequences.
- Measures taken or proposed to address the breach and to mitigate its possible adverse effects.
- Contact point at the Processor for further information.

  10.3 If information is not available at the time of the initial notification, the Processor provides it in phases without undue further delay.

  10.4 The breach-response runbook is at [`docs/runbooks/breach-response.md`](../runbooks/breach-response.md).

---

## 11. Return or deletion at end of service

11.1 At the choice of the Controller, the Processor returns or deletes all personal data after the end of the provision of services relating to processing, and deletes existing copies, unless Union or Member-State law requires storage of the personal data (notably national clinical-records retention obligations).

11.2 The Controller's choice (return or delete) is recorded in the service contract or, failing that, communicated in writing at least 30 days before the end of the service.

11.3 Records retained under a legal-obligation basis remain protected by this DPA's security measures for the duration of the retention.

---

## 12. Audit rights (Art. 28(3)(h))

12.1 The Processor makes available to the Controller all information necessary to demonstrate compliance with the obligations in Art. 28 and this DPA.

12.2 The Controller — or an auditor mandated by the Controller — may carry out audits, including inspections, at the Controller's expense. The Parties agree to:

- A minimum of **30 days' prior written notice**, except where a regulator or a confirmed breach requires immediate action.
- Audits during business hours, minimising disruption to operational continuity.
- Non-disclosure of any commercially sensitive information observed during the audit.
- A frequency of at most **once per calendar year**, plus any audit required by a regulator or following a confirmed breach.

  12.3 The Processor cooperates with the supervisory authority in the performance of its tasks (Art. 31).

---

## 13. Liability and governing law

13.1 Liability is governed by the underlying service contract. To the extent that the service contract is silent, GDPR Art. 82 + Art. 83 apply.

13.2 This DPA is governed by the law of `[Member State]`. Courts of `[Member State city]` have exclusive jurisdiction.

---

## Annex A — Processing activities (per RoPA `RoPA.md`)

`[Cross-reference the Controller's RoPA — or attach as Annex A.]`

## Annex B — Sub-processors and transfer mechanisms

| #   | Sub-processor                   | Service           | Location      | Transfer mechanism | Effective date |
| --- | ------------------------------- | ----------------- | ------------- | ------------------ | -------------- |
| 1   | `[e.g. cloud hosting provider]` | Compute + storage | `[EU region]` | Intra-EEA          | `[YYYY-MM-DD]` |
| 2   | `[Backup vendor]`               | Backup + DR       | `[EU region]` | Intra-EEA          | `[YYYY-MM-DD]` |
| 3   | `[Add others]`                  |                   |               |                    |                |

## Annex C — National-law overlays

| Member State | Applicable law                                                             | Adjustments to this DPA                                                                  |
| ------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| NL           | Wabvpz + UAVG + NEN 7510 / 7512 / 7513 + WGBO                              | `[e.g. 20-year retention from last entry per WGBO Art. 7:454 BW]`                        |
| DE           | §203 StGB + §10 Bundesärzteordnung + BDSG                                  | `[e.g. confidentiality oath formality; 10-year retention default, 30 for X-ray records]` |
| FR           | Code de la santé publique L1110-4 + PGSSI-S + Loi Informatique et Libertés | `[e.g. HDS hosting certification requirement]`                                           |
| `[Other]`    |                                                                            |                                                                                          |

---

## Signatures

| Party      | Name | Role | Signature | Date |
| ---------- | ---- | ---- | --------- | ---- |
| Controller |      |      |           |      |
| Processor  |      |      |           |      |
