# ADR-0031 — Pluggable demographic provider (built-in + FHIR R4; HL7v2 + PDQ reserved)

- **Status:** Accepted
- **Date:** 2026-05-29
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** ADR-0023 (shape, not intent)
- **Superseded by:** —

## Context

Architecture-doc reference: §2, M7 milestone. ADR-0023 chose a built-in openEHR-spec demographic service (own Postgres schema, own REST surface) because EHRbase does not implement the demographic side of openEHR. ADR-0023 served its purpose for early planning but research conducted 2026-05-29 surfaced facts that change the architecture:

1. **The openEHR Demographic IM spec explicitly supports BOTH standalone AND wrapper-around-existing-PMI.** Quoting the [RM 1.1.0 Demographic IM](https://specifications.openehr.org/releases/RM/latest/demographic.html): _"as a specification of a demographic service, either standalone, or a 'wrapper' service for an existing system such as a patient master index (PMI)"_. The standard expects pluggability.
2. **EHRbase's own commercial vendor (vitagroup HIP CDR) stores demographics in HL7 FHIR R4**, not the openEHR demographic IM. EHRbase docs name "IHE PIX/PDQ actor, FHIR Server, openEHR Demographics Repository, or custom" as the demographic options.
3. **~80% of hospitals already have a PMI / HIS broadcasting HL7 v2 ADT.** A hardcoded built-in store forces those deployments to migrate their entire patient-identity backbone — a non-starter for established sites.
4. **Newer integrations use FHIR `Patient`** (regulatory standard in EHDS, US Core IG, ABDM India). R4 is the production version; R5 ~5% adoption; R6 ballot 4 with final publication 2027+.

## Decision

**Demographic data access is pluggable.** Apps consume a `DemographicProvider` interface; the concrete adapter is resolved at startup from the `DEMOGRAPHIC_PROVIDER` env var.

Provider interface (sketch — full definition in `packages/demographic-core/src/provider.ts`):

```ts
export interface DemographicProvider {
  createParty(input: CreatePartyInput, ctx: ProviderContext): Promise<PartyRef>
  updateParty(
    id: string,
    input: UpdatePartyInput,
    ctx: ProviderContext,
  ): Promise<PartyRef>
  getParty(
    id: string,
    opts?: { version?: number },
    ctx?: ProviderContext,
  ): Promise<Party | null>
  searchParty(
    query: PartySearchQuery,
    ctx: ProviderContext,
  ): Promise<PartySearchResult>
  deactivateParty(
    id: string,
    justification: string,
    ctx: ProviderContext,
  ): Promise<void>
  mergeParty(into: string, from: string, ctx: ProviderContext): Promise<void>
  addIdentifier(
    partyId: string,
    ns: string,
    value: string,
    ctx: ProviderContext,
  ): Promise<void>
  endIdentifier(
    partyId: string,
    identifierId: string,
    ctx: ProviderContext,
  ): Promise<void>
  addRelationship(
    input: CreateRelationshipInput,
    ctx: ProviderContext,
  ): Promise<RelationshipRef>
  endRelationship(id: string, ctx: ProviderContext): Promise<void>
  listVersions(
    partyId: string,
    ctx: ProviderContext,
  ): Promise<PartyVersionRef[]>
  readonly capabilities: {
    supportsMutation: boolean
    supportsMerge: boolean
    readonly: boolean
  }
}
```

`capabilities` lets the admin UI gate actions per provider (read-only banner when `readonly: true`).

**v1.0 ships two concrete adapters in M7:**

- **`packages/demographic-core` — built-in Postgres** (default; `DEMOGRAPHIC_PROVIDER=builtin`). VERSIONED_PARTY semantics in the `demographic` Postgres schema on `platform-db` (parallel to `audit` + `auth`).
- **`packages/demographic-adapter-fhir` — FHIR R4 Patient** (`DEMOGRAPHIC_PROVIDER=fhir`). Talks to a hospital FHIR server's `Patient` endpoint via `GET/POST/PUT /Patient` + `GET /Patient?identifier=…`. Maps R4 ↔ openEHR PARTY. R5 + R6 are pure-additive packages added later (ADR-0033 — no app re-touch).

**v1.x reserved slots:**

- `packages/demographic-adapter-hl7v2-adt` — TCP MLLP listener (likely runs as a separate `apps/adt-ingestor` Node service). Defers because HL7 v2 transport is non-trivial.
- `packages/demographic-adapter-pix-pdq` — IHE PIXm / PDQm (cross-org master patient index). National-deployment concern.
- `packages/demographic-adapter-custom` — escape hatch for deployment-specific shims.

**The openEHR Demographic IM remains the canonical wire shape.** All adapters speak the same `Party`, `PartyIdentity`, `Contact`, `Address`, `Role`, `PartyRelationship` types from `@ehrbase-ui/openehr-rm`. Adapters translate; the rest of the app never sees adapter-specific payloads.

**Pseudonymisation** (HMAC-SHA256 with `AUDIT_PSEUDONYM_SECRET`, §14.4) lives in `packages/demographic-core/src/identifier/pseudonymize.server.ts` and is provider-agnostic.

**Audit** — every adapter call emits a `resourceType: 'PARTY'` NEN-7513 event via `@ehrbase-ui/audit::logAudit()`. The provider name lands in the audit event's `source.adapterName` field for forensic clarity (ADR-0024 dual-layer rule).

## Consequences

**Positive.** (a) Every common hospital deployment pattern (greenfield, existing FHIR server, future ADT-feed) is supported without re-architecting. (b) The openEHR Demographic IM is honoured as the standard's spec intends ("either standalone or wrapper"). (c) HL7 v2 ADT + IHE PDQ become pure-additive packages — no v1.0 surface needs to change. (d) Admin UI capability-gating gives a single coherent UX across providers (writes greyed out when the provider is read-only).

**Negative.** (a) The provider interface is a contract — any breaking change ripples to every adapter. Mitigated by `@ehrbase-ui/demographic-core` semver and a contract test suite that every adapter package must pass. (b) FHIR R4 mapping has lossy edges (openEHR `PARTY_RELATIONSHIP.time_validity` doesn't have a direct R4 equivalent — must be tracked in `Patient.extension`); documented in ADR-0033. (c) Capability flags expand the admin UI's state machine slightly.

**Trade-off vs hardcoded built-in (ADR-0023 original shape).** Rejected. Forces every existing-PMI hospital to migrate. Wrong default for v1.0.

**Trade-off vs adapter-as-data only (no shared `Party` type).** Rejected. Without a canonical wire shape every clinical surface (banner, search, encounter list) would have to switch on provider type — leaking provider concerns throughout the app.

## Verification

- `DEMOGRAPHIC_PROVIDER=builtin pnpm dev` — admin UI shows full CRUD; `POST /api/demographic/party` succeeds; audit event has `source.adapterName='builtin'`
- `DEMOGRAPHIC_PROVIDER=fhir DEMOGRAPHIC_FHIR_BASE=http://localhost:8082/fhir pnpm dev` against `docker run hapiproject/hapi:v7.x` — admin UI shows read-only banner; search by identifier works; create attempts return capability-gated error; audit event has `source.adapterName='fhir-r4'`
- Contract test suite under `packages/demographic-core/__tests__/contract.ts` parametrized over every adapter — all green
- A `fhirVersion: 'R5'` config throws `R5 mapper not implemented in v1.0` (NOT a silent fallback)
- Inviolable rule 12 holds: no clinical composition contains demographic data; every `EHR_STATUS.subject` is `PARTY_IDENTIFIED.external_ref` into the active provider
