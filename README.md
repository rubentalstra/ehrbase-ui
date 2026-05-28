# ehrbase-ui

> Patient-centric clinical workspace on the [openEHR](https://specifications.openehr.org/) open standard, sitting on [EHRbase](https://github.com/ehrbase/ehrbase). Modelled on HIX-style hospital EPDs (HIX / Epic / Cerner / OpenMRS). Multi-role from day one — physician / nurse / admin. TanStack Start + React 19 + shadcn/ui + Keycloak. Built for EU clinical deployments — GDPR-compliant, with a comprehensive audit-log schema that satisfies EU healthcare audit requirements (ISO 27799 baseline) and meets every member-state national standard we've checked, including NEN 7513 (NL).

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Status: Pre-v1.0](https://img.shields.io/badge/Status-Pre--v1.0-orange)](docs/IMPLEMENTATION_CHECKLIST.md)

## Status

**Pre-v1.0, greenfield.** No production users yet. The full v1.0 target architecture is documented; building it out is tracked in [`docs/IMPLEMENTATION_CHECKLIST.md`](docs/IMPLEMENTATION_CHECKLIST.md).

## Documentation

- **[Architecture](docs/architecture.md)** — the authoritative spec covering stack, BFF, audit logging, accessibility, CI/CD, and compliance.
- **[Clinical UI](docs/CLINICAL-UI.md)** — single source of truth for every EPD surface: openEHR archetype mapping, user journeys, role dashboards, screen catalogue (22 surfaces). **Read this before writing any PHI-touching UI code.**
- **[Demo accounts](docs/demo-accounts.md)** — dev login credentials (one per role) + how the prod-safe seeding flag works.
- **[Implementation checklist](docs/IMPLEMENTATION_CHECKLIST.md)** — 18-milestone tracker.
- **[v1.x roadmap](docs/v1.x-roadmap.md)** — deferred features (scheduling, embedded DICOM, AI CDS, real-time, …).
- **[AQL catalogue](docs/aql-catalogue.md)** — named, parameterised, version-pinned queries the UI runs.
- **[References](docs/REFERENCES.md)** — every external link the architecture cites, plus the verified-version table.
- **[ADRs](docs/adr/)** — Architecture Decision Records.

## What you can do in this UI (v1.0 scope)

EPD surfaces — status badges: ✅ done · 🚧 in-progress · 📋 planned · ⏭️ v1.x.

- 🚧 Authentication, sessions, audit, RBAC, break-glass — ✅ M2
- 🚧 Workspace shell + i18n + state — ✅ M3
- 📋 Audit governance + retention (cold WORM, sample-of-60, DPIA/DPA/RoPA) — M4
- 📋 Observability (OTel + Tempo + Loki + Prometheus + PHI redaction) — M5
- 📋 openEHR engine (web-template fetch, dynamic forms, FLAT/STRUCTURED/CANONICAL) — M6
- 📋 Demographic service (openEHR-spec PARTY / PERSON / etc., separate Postgres schema) — M7
- 📋 Patient core (header banner, search, recently-viewed, encounters) — M8
- 📋 Vitals + labs (flowsheet, trend charts, abnormal-flag highlighting) — M9
- 📋 Clinical notes (SOAP, structured + free-text, sign + draft) — M10
- 📋 Problems + medications + allergies + immunisations — M11
- 📋 Orders / CPOE (meds, labs, imaging, order sets) — M12
- 📋 Care plan + tasks (openEHR PROC `WORK_PLAN` / `TASK_PLAN` / `PLAN_ITEM`) — M13
- 📋 AQL editor + virtualised result tables — M14
- 📋 Admin UI + audit-review UI + CDS rule authoring — M15
- 📋 Discharge + referrals + document viewer + print/PDF + CDS runtime — M16
- 📋 Messaging + decision-support surfaces — M17
- ⏭️ Scheduling / appointments — v1.x ([roadmap](docs/v1.x-roadmap.md))
- ⏭️ Embedded DICOM viewer — v1.x
- ⏭️ AI / LLM CDS — v1.x
- ⏭️ Real-time WS/SSE updates — v1.x
- ⏭️ External PMI (HL7 v2 ADT) integration — v1.x
- ⏭️ Patient portal beyond `/me/access-log` — v1.x

## Quickstart (Foundation milestone — once it lands)

```bash
# Prerequisites: Node 24, pnpm 11, Docker engine 29
pnpm install
cp .env.example .env.local                    # COMPOSE_PROFILES=demo seeds 4 dev accounts
docker compose --profile demo up -d --wait    # EHRbase + Keycloak (+ realm + demo users) + Valkey + Postgres + SeaweedFS
pnpm dev                                       # boots the UI dev server at http://localhost:3000
```

Log in with any of the four [demo accounts](docs/demo-accounts.md) — e.g. `dev-clinician` / `DevClinician123!`. Production never activates the `demo` profile and never sees these credentials.

## License

Apache 2.0 — see [`LICENSE`](LICENSE).

## Contributing

Governance files (Code of Conduct, vulnerability disclosure policy, contribution guide) land alongside the rest of the Foundation milestone PR. Until then, please open an issue rather than emailing maintainers.
