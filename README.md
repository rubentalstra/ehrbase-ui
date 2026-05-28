# ehrbase-ui

> The missing open-source UI for [EHRbase](https://github.com/ehrbase/ehrbase). Clinical workspace, dynamic openEHR forms, AQL query builder. TanStack Start + React 19 + shadcn/ui + Keycloak. Built for EU clinical deployments — GDPR-compliant, with a comprehensive audit-log schema that satisfies EU healthcare audit requirements (ISO 27799 baseline) and meets every member-state national standard we've checked, including NEN 7513 (NL).

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Status: Pre-v1.0](https://img.shields.io/badge/Status-Pre--v1.0-orange)](docs/IMPLEMENTATION_CHECKLIST.md)

## Status

**Pre-v1.0, greenfield.** No production users yet. The full v1.0 target architecture is documented; building it out is tracked in [`docs/IMPLEMENTATION_CHECKLIST.md`](docs/IMPLEMENTATION_CHECKLIST.md).

## Documentation

- **[Architecture](docs/architecture.md)** — the authoritative v3.4 spec covering stack, BFF, dynamic forms, audit logging, accessibility, CI/CD, and compliance.
- **[Implementation checklist](docs/IMPLEMENTATION_CHECKLIST.md)** — milestone tracker.
- **[References](docs/REFERENCES.md)** — every external link the architecture cites, plus the verified-version table.
- **[ADRs](docs/adr/)** — Architecture Decision Records.

## Quickstart (Foundation milestone — once it lands)

```bash
# Prerequisites: Node 24, pnpm 11, Docker engine 29
pnpm install
docker compose up -d   # boots EHRbase + Keycloak + Valkey + Postgres
pnpm dev               # boots the UI dev server
```

## License

Apache 2.0 — see [`LICENSE`](LICENSE).

## Contributing

Governance files (Code of Conduct, vulnerability disclosure policy, contribution guide) land alongside the rest of the Foundation milestone PR. Until then, please open an issue rather than emailing maintainers.
