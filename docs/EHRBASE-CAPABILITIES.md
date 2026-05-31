# EHRbase 2.x capability boundary — open-source vs. commercial vs. our app layer

> The single reference for **what EHRbase 2.31.0 gives us out of the box** vs. what we must build
> ourselves. Read this before assuming a CDR feature exists. Backed by [ADR-0043](adr/0043-ehrbase-oss-boundary.md).
>
> **Pin:** EHRbase **2.31.0** (Apache-2.0). The commercial product is **HIP EHRbase** (vitagroup).
> Verified 2026-05-31 against `docs.ehrbase.org` + the `ehrbase/ehrbase` source trees.

## Why this doc exists

EHRbase 1.x shipped some features (ATNA audit, ABAC access control) that were **removed in the
1.x→2.x rewrite**. Other features are **commercial HIP-only**. Older docs and blog posts still
describe the 1.x reality, so it is easy to design against a feature that isn't in our tier. This doc
draws the line and names the open-source workaround for every gap.

## A — In open-source EHRbase 2.x (we rely on these)

| Capability                      | Notes                                                                                                               | Config / endpoint                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Full openEHR REST               | EHR, EHR_STATUS, Composition, Versioned Composition/EHR_STATUS, Contribution, Directory                             | base `/rest/openehr/v1`                                                          |
| AQL — ad-hoc + stored           | both open-source                                                                                                    | Query + Definition controllers; `ehrbase.aql.*`, `ehrbase.rest.aql.*`            |
| Templates                       | ADL 1.4 OPT upload + **Web Template** + FLAT (ADL 2 also exposed; we use ADL 1.4 per ADR-0032)                      | `/definition/template/adl1.4/{id}` (Web Template via `Accept: application/json`) |
| Versioning + write audit        | `CONTRIBUTION` / `AUDIT_DETAILS` / `ATTESTATION` — **commit lineage only, no read audit**                           | committer derived from the forwarded auth token                                  |
| Auth + coarse RBAC              | NOOP / Basic / OAuth2-JWT (+ Keycloak); roles `USER` / `ADMIN` from `realm_access.roles`                            | `SECURITY_AUTHTYPE`, `...JWT_ISSUERURI`, `SECURITY_OAUTH2USERROLE/ADMINROLE`     |
| Plugin framework                | pf4j + pf4j-spring; SPI `org.ehrbase.openehr:plugin`; service extension-point hooks                                 | `plugin-manager.*`                                                               |
| Admin API                       | hard delete EHR/Composition/Contribution/Directory/Query/Template — **dev-only, bypasses versioning, NOT for prod** | `admin-api.active`, `/rest/admin`                                                |
| Status / metrics                | Spring Boot Actuator (health / info / metrics / prometheus), `ADMIN_ONLY` by default                                | `/management`                                                                    |
| Item-Tag API                    | experimental — tag EHR_STATUS / Composition (e.g. "needs co-sign", "abnormal"); off by default                      | `ehrbase.rest.experimental.tags.enabled`                                         |
| External terminology validation | callout to a FHIR terminology server (FHIR-only); off by default                                                    | `validation.external-terminology.*`                                              |
| Distributed cache               | Caffeine default; Redis/Valkey supported                                                                            | `spring.cache.type: redis`                                                       |

## B — NOT in open-source EHRbase 2.x → our app-layer responsibility

| Gap                                                  | Status                                            | Our open-source workaround                                                                       | Owner                                                   |
| ---------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| **ATNA read-access audit**                           | OSS in 1.x, **removed in 2.x**; HIP commercial    | IHE ATNA (DICOM AuditMessage) emitted from the BFF → Postgres `audit` schema (+ optional syslog) | [ADR-0041](adr/0041-audit-access-governance.md), **M9** |
| **ABAC / data-level access control**                 | OSS in 1.x, **removed in 2.x**; HIP enterprise    | Care-relationship / care-team gate enforced in the BFF before proxying; deny → 403 + break-glass | [ADR-0041](adr/0041-audit-access-governance.md), **M9** |
| **Event trigger / change notification**              | HIP commercial                                    | AQL polling on a version/timestamp cursor (lab-alerts, inbox); real-time WS/SSE stays v1.x       | **M23**                                                 |
| **Multi-tenancy**                                    | HIP commercial                                    | One EHRbase instance per tenant, or org-scoped filtering in the BFF                              | —                                                       |
| **EHR-level Merge** (move compositions between EHRs) | HIP commercial                                    | Not needed — our patient-merge is _demographic-party_ merge in our own DB; a patient has one EHR | **M7**                                                  |
| **Maintained FHIR Bridge**                           | `ehrbase/fhir-bridge` **archived / unmaintained** | FHIR is our own adapter layer                                                                    | [ADR-0033](adr/0033-fhir-adapter-scope.md)              |
| **Yugabyte distributed SQL**                         | HIP commercial                                    | Single-node / managed PostgreSQL 18.4                                                            | —                                                       |

## Operational rules that follow

- **Deletes** use logical openEHR versioning (a new version with `change_type = deleted`), never the
  Admin API hard-delete.
- **Committer** comes from the forwarded Keycloak token; we never send `openEHR-COMMITTER-*` /
  `openEHR-AUDIT-*` headers — EHRbase 2.31 ignores them (confirmed in the M6 probe).
- Build/run needs **Java 25**; PostgreSQL ≥15 (we pin **18.4**); EHRbase uses two schemas
  (`ehr` + `ext`). Review EHRbase `UPDATING.md` on every version bump for boundary drift.

## Sources

- EHRbase docs — `https://docs.ehrbase.org/` (openEHR API `/api/hip-ehrbase/openehr`, Admin API
  `/api/hip-ehrbase/admin`, Enterprise Features `/docs/EHRbase/Enterprise-Features/Overview` + `/ATNA`).
- EHRbase server (Apache-2.0) — `https://github.com/ehrbase/ehrbase`; example plugin
  `https://github.com/ehrbase/ExamplePlugin`; archived FHIR bridge `https://github.com/ehrbase/fhir-bridge`.
- ABAC removal evidence — issues `https://github.com/ehrbase/ehrbase/issues/690`, `/issues/698`;
  absence of `abac:` / `ipf.atna:` blocks on the `develop` branch config.
