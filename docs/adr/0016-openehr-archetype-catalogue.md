# ADR-0016 — openEHR archetype catalogue for v1.0

- **Status:** Accepted
- **Date:** 2026-05-28
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

Every clinical surface in `docs/CLINICAL-UI.md` §7 binds to one or more **CKM archetype IDs**. CKM (`ckm.openehr.org/ckm/`) is the openEHR Foundation's Clinical Knowledge Manager — a living catalogue of archetypes maintained by the international community, with national CKM mirrors (NL, DE, FR, …) that publish either national variants or country-specific overrides.

Without a pinned catalogue the team bike-sheds archetype choice mid-implementation, and surfaces from different milestones reference incompatible versions (e.g. `blood_pressure.v2` in vitals while orders write `medication_order.v2` against an OPT that expects `.v3`). That breaks both the BFF audit-classification logic and the AQL stored-query catalogue.

User decision (planning round 2, decision #11): **international CKM with national overrides where they exist** — prefer international archetypes; allow a national variant per surface where the national CKM has a more specific one. Documented per surface.

## Decision

The v1.0 archetype catalogue is **locked** at the start of M6 (the openEHR engine milestone). Locked means:

- The exact CKM archetype ID + version is recorded for each surface in `docs/CLINICAL-UI.md` §7 + `docs/aql-catalogue.md`.
- The `openehr-archetype-reviewer` sub-agent (see `.claude/agents/`) checks every new openEHR write path against this catalogue at PR review time.
- Catalogue changes within v1.0 require an ADR addendum, not a silent diff.

**International by default.** Every surface defaults to the international CKM archetype (no country prefix). The same archetype works across every EU deployment.

**National overrides per surface.** Where a national CKM publishes a variant that adds clinically-significant constraints (e.g. NL CKM has a `medication_order.v3-nl` with stricter dosage-unit constraints), the surface's CLINICAL-UI.md entry lists both:

```
International: openEHR-EHR-INSTRUCTION.medication_order.v3
National override (NL): openEHR-EHR-INSTRUCTION.medication_order.v3 (NL CKM, ADL2 spec, stricter unit constraints)
```

The deployment's `application.yml` config picks which one is fetched at OPT-fetch time. The Web Template the BFF receives reflects the active variant.

**v1.0 catalogue.** The locked archetype list lives in `docs/CLINICAL-UI.md` §7. Each entry's `Archetypes` line is the canonical reference.

**Re-verification cadence.** CKM is a living database — archetype versions evolve. Re-verify the catalogue before each milestone PR opens; never silently bump a `.v2 → .v3` mid-implementation.

## Consequences

**Positive.** Every clinical surface has a single source of truth for "what data model does this read/write". The AQL catalogue (`docs/aql-catalogue.md`) can pin parameter shapes to archetype paths. Audit-event resource-type classification (per `src/lib/http/ehrbase-proxy.server.ts`) can switch on archetype ID, not on URL pattern.

**Negative.** Locking the catalogue increases the friction to ship a "quick" change that needs a different archetype. Mitigation: ADR addenda are cheap (a few lines + a CLINICAL-UI.md diff). The cost of _not_ locking is silent runtime breakage during AQL execution against a changed shape.

National-override discipline is non-trivial: deployments have to be explicit about which CKM they pull from. We don't auto-detect locale → national CKM at runtime; that's a deployment-configuration decision recorded per environment.
