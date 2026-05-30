// FhirDemographicProvider — wraps a hospital FHIR R4 Patient server behind the
// DemographicProvider interface (ADR-0031, ADR-0033). Version-aware: only R4/R4B
// are implemented in v1.0; R5/R6 throw at CONSTRUCTION (not first request) so a
// misconfiguration fails loudly (rule 13 — no silent fallback).
//
// Default posture is READ-ONLY (capabilities.readonly = true): a FHIR server is
// usually an existing PMI that owns writes (ADR-0031 context). Set
// allowWrites:true to enable the FULL mutation surface — create / update /
// deactivate / addIdentifier / endIdentifier / merge / relationships — all
// capability-gated (a read-only provider throws CapabilityError). Merge maps to
// FHIR-native Patient.link (replaced-by / replaces); relationships map to the
// RelatedPerson resource; both round-trip without loss (ADR-0033 addendum).
//
// Every op emits a NEN-7513 audit event through the injected AuditSink with
// source.adapterName='fhir-r4' (rule 1; ADR-0024). Pseudonymisation is injected
// (HMAC-SHA256 app-side) so a raw national id is never sent to the FHIR server
// for audit (ADR-0033).

import {
  CapabilityError,
  DemographicValidationError,
  PartyNotFoundError,
  validateIdentifier,
  type AuditSink,
  type CreatePartyInput,
  type CreateRelationshipInput,
  type DemographicProvider,
  type DemographicProviderCapabilities,
  type Party,
  type PartyAuditAction,
  type PartyIdentifier,
  type PartyRef,
  type PartySearchQuery,
  type PartySearchResult,
  type PartyVersionRef,
  type ProviderContext,
  type RelationshipRef,
  type UpdatePartyInput,
} from "@ehrbase-ui/demographic-core";

import { FhirHttpClient, type FetchLike } from "./client.ts";
import {
  DEACTIVATION_REASON_EXTENSION,
  REL_TARGET_EXTENSION,
  REL_TYPE_SYSTEM,
  type FhirPatient,
  type FhirRelatedPerson,
} from "./fhir-types.ts";
import { namespaceToSystem, partyToPatient, patientToParty } from "./mapping.ts";

export type FhirVersion = "R4" | "R4B" | "R5" | "R6";

export interface FhirProviderConfig {
  baseUrl: string;
  fhirVersion: FhirVersion;
  audit: AuditSink;
  pseudonymize: (value: string) => string;
  /** Enable writes (create/update/deactivate). Default false → read-only PMI wrapper. */
  allowWrites?: boolean;
  token?: string;
  fetch?: FetchLike;
  /** PartyRef namespace placed in EHR_STATUS.subject.external_ref (rule 12). Default "demographic". */
  partyRefNamespace?: string;
}

export class FhirDemographicProvider implements DemographicProvider {
  readonly name = "fhir-r4";
  readonly capabilities: DemographicProviderCapabilities;

  readonly #client: FhirHttpClient;
  readonly #audit: AuditSink;
  readonly #pseudonymize: (value: string) => string;
  readonly #allowWrites: boolean;
  readonly #namespace: string;

  constructor(config: FhirProviderConfig) {
    if (config.fhirVersion !== "R4" && config.fhirVersion !== "R4B") {
      throw new Error(`${config.fhirVersion} mapper not implemented in v1.0`);
    }
    this.#client = new FhirHttpClient({ baseUrl: config.baseUrl, token: config.token, fetch: config.fetch });
    this.#audit = config.audit;
    this.#pseudonymize = config.pseudonymize;
    this.#allowWrites = config.allowWrites ?? false;
    this.#namespace = config.partyRefNamespace ?? "demographic";
    this.capabilities = {
      supportsMutation: this.#allowWrites,
      supportsMerge: this.#allowWrites,
      readonly: !this.#allowWrites,
    };
  }

  #ref(id: string): PartyRef {
    return { namespace: this.#namespace, id, type: "PERSON" };
  }

  #subjectHash(identifiers: readonly PartyIdentifier[]): string | undefined {
    const first = identifiers[0];
    return first ? this.#pseudonymize(`${first.namespace}|${first.value}`) : undefined;
  }

  #requireWrites(): void {
    if (!this.#allowWrites) {
      throw new CapabilityError("the FHIR demographic provider is read-only (allowWrites=false)");
    }
  }

  #validate(identifiers: readonly PartyIdentifier[]): void {
    for (const ident of identifiers) {
      const { valid, known } = validateIdentifier(ident.namespace, ident.value);
      if (known && !valid) {
        throw new DemographicValidationError(`invalid identifier for namespace ${ident.namespace}`);
      }
    }
  }

  async #audited<T>(
    action: PartyAuditAction,
    ctx: ProviderContext,
    meta: { partyId?: string; subjectIdHash?: string; detail?: string },
    op: () => Promise<T>,
  ): Promise<T> {
    try {
      const result = await op();
      await this.#audit.record({ action, outcome: "SUCCESS", ctx, ...meta });
      return result;
    } catch (err) {
      await this.#audit.record({ action, outcome: "FAILURE", ctx, ...meta });
      throw err;
    }
  }

  async createParty(input: CreatePartyInput, ctx: ProviderContext): Promise<PartyRef> {
    this.#requireWrites();
    this.#validate(input.identifiers);
    const draft: Party = {
      id: "",
      active: true,
      version: 1,
      identifiers: input.identifiers,
      names: input.names,
      gender: input.gender,
      birthDate: input.birthDate,
      deceased: input.deceased,
      addresses: input.addresses,
      contacts: input.contacts,
    };
    return this.#audited(
      "CREATE",
      ctx,
      { subjectIdHash: this.#subjectHash(input.identifiers) },
      async () => {
        const created = await this.#client.create(partyToPatient(draft));
        // A PartyRef with an empty id is not a valid EHR_STATUS.subject
        // external_ref (rule 12) — fail loudly if the server omitted the id.
        if (!created.id) {
          throw new DemographicValidationError("FHIR server returned a Patient without an id");
        }
        return this.#ref(created.id);
      },
    );
  }

  async updateParty(id: string, input: UpdatePartyInput, ctx: ProviderContext): Promise<PartyRef> {
    this.#requireWrites();
    return this.#audited("UPDATE", ctx, { partyId: id }, async () => {
      const current = await this.#client.read(id);
      if (!current) throw new PartyNotFoundError();
      const prev = patientToParty(current);
      if (input.identifiers !== undefined) this.#validate(input.identifiers);
      const next: Party = {
        ...prev,
        identifiers: input.identifiers ?? prev.identifiers,
        names: input.names ?? prev.names,
        gender: input.gender ?? prev.gender,
        birthDate: input.birthDate ?? prev.birthDate,
        deceased: input.deceased ?? prev.deceased,
        addresses: input.addresses ?? prev.addresses,
        contacts: input.contacts ?? prev.contacts,
      };
      const updated = await this.#client.update(id, partyToPatient(next));
      return this.#ref(updated.id ?? id);
    });
  }

  async getParty(id: string, opts: { version?: number }, ctx: ProviderContext): Promise<Party | null> {
    return this.#audited("READ", ctx, { partyId: id }, async () => {
      const patient =
        opts.version === undefined
          ? await this.#client.read(id)
          : await this.#client.vread(id, String(opts.version));
      return patient ? patientToParty(patient) : null;
    });
  }

  async searchParty(query: PartySearchQuery, ctx: ProviderContext): Promise<PartySearchResult> {
    const params: Record<string, string> = {};
    const detailParts: string[] = [];
    let subjectIdHash: string | undefined;
    if (query.identifier) {
      params["identifier"] = `${namespaceToSystem(query.identifier.namespace)}|${query.identifier.value}`;
      detailParts.push("identifier");
      subjectIdHash = this.#pseudonymize(`${query.identifier.namespace}|${query.identifier.value}`);
    }
    if (query.family) {
      params["family"] = query.family;
      detailParts.push("family");
    }
    if (query.given) {
      params["given"] = query.given;
      detailParts.push("given");
    }
    if (query.birthDate) {
      params["birthdate"] = query.birthDate;
      detailParts.push("birthDate");
    }
    // Clinical search returns ACTIVE patients only (matches the built-in
    // adapter's active-only search), so a deactivated party drops out.
    params["active"] = "true";
    params["_count"] = String(query.limit);
    params["_offset"] = String(query.offset);

    return this.#audited(
      "QUERY",
      ctx,
      { subjectIdHash, detail: `search:${detailParts.join("+") || "all"}` },
      async () => {
        const bundle = await this.#client.search(params);
        const parties = (bundle.entry ?? [])
          .map((e) => e.resource)
          .filter((r) => r !== undefined)
          .map((r) => patientToParty(r))
          .filter((p) => p.active);
        return { parties, total: bundle.total ?? parties.length };
      },
    );
  }

  async deactivateParty(id: string, justification: string, ctx: ProviderContext): Promise<void> {
    this.#requireWrites();
    await this.#audited("DELETE", ctx, { partyId: id, detail: "deactivate" }, async () => {
      const current = await this.#client.read(id);
      if (!current) throw new PartyNotFoundError();
      // Persist the justification on the FHIR record (parity with the built-in's
      // change_description column) via the deactivation-reason extension.
      const deactivated: FhirPatient = {
        ...partyToPatient({ ...patientToParty(current), active: false }),
        extension: [
          ...(current.extension ?? []),
          { url: DEACTIVATION_REASON_EXTENSION, valueString: justification },
        ],
      };
      await this.#client.update(id, deactivated);
    });
  }

  // Merge via FHIR-native Patient.link (ADR-0033 addendum): the source is
  // deactivated and linked replaced-by → target; the target is linked replaces →
  // source. The full bidirectional lineage is preserved in the FHIR record.
  async mergeParty(into: string, from: string, ctx: ProviderContext): Promise<void> {
    this.#requireWrites();
    if (into === from) throw new DemographicValidationError("cannot merge a party into itself");
    // Resolve the source up front so the audit event carries the subject hash
    // (cross-references the merge to the patient across audit queries).
    const source = await this.#client.read(from);
    if (!source) throw new PartyNotFoundError("merge source not found");
    const subjectIdHash = this.#subjectHash(patientToParty(source).identifiers);
    await this.#audited("ADMIN_CHANGE", ctx, { partyId: from, subjectIdHash, detail: "merge" }, async () => {
      const target = await this.#client.read(into);
      if (!target) throw new PartyNotFoundError("merge target not found");
      const deactivatedSource: FhirPatient = {
        ...source,
        active: false,
        link: [...(source.link ?? []), { other: { reference: `Patient/${into}` }, type: "replaced-by" }],
      };
      await this.#client.update(from, deactivatedSource);
      const linkedTarget: FhirPatient = {
        ...target,
        link: [...(target.link ?? []), { other: { reference: `Patient/${from}` }, type: "replaces" }],
      };
      await this.#client.update(into, linkedTarget);
    });
  }

  async addIdentifier(
    partyId: string,
    namespace: string,
    value: string,
    ctx: ProviderContext,
  ): Promise<void> {
    this.#requireWrites();
    this.#validate([{ namespace, value }]);
    await this.#audited(
      "UPDATE",
      ctx,
      { partyId, subjectIdHash: this.#pseudonymize(`${namespace}|${value}`), detail: "add-identifier" },
      async () => {
        const current = await this.#client.read(partyId);
        if (!current) throw new PartyNotFoundError();
        const prev = patientToParty(current);
        const next: Party = { ...prev, identifiers: [...prev.identifiers, { namespace, value }] };
        await this.#client.update(partyId, partyToPatient(next));
      },
    );
  }

  async endIdentifier(partyId: string, identifierId: string, ctx: ProviderContext): Promise<void> {
    this.#requireWrites();
    await this.#audited("UPDATE", ctx, { partyId, detail: "end-identifier" }, async () => {
      const current = await this.#client.read(partyId);
      if (!current) throw new PartyNotFoundError();
      const prev = patientToParty(current);
      // FHIR has no per-identifier end date; ending an identifier removes it from
      // the active set (the lossy edge documented in ADR-0033).
      const next: Party = {
        ...prev,
        identifiers: prev.identifiers.filter((i) => i.id !== identifierId),
      };
      await this.#client.update(partyId, partyToPatient(next));
    });
  }

  // Relationships via FHIR RelatedPerson (ADR-0033 addendum). The type round-
  // trips losslessly through a project code system; source = `patient`, target =
  // a typed extension; time-validity = `period`. No lossy edge.
  async addRelationship(input: CreateRelationshipInput, ctx: ProviderContext): Promise<RelationshipRef> {
    this.#requireWrites();
    return this.#audited("UPDATE", ctx, { partyId: input.source, detail: "add-relationship" }, async () => {
      const rp: FhirRelatedPerson = {
        resourceType: "RelatedPerson",
        active: true,
        patient: { reference: `Patient/${input.source}` },
        relationship: [{ coding: [{ system: REL_TYPE_SYSTEM, code: input.type }] }],
        period: { start: input.start, end: input.end },
        extension: [{ url: REL_TARGET_EXTENSION, valueReference: { reference: `Patient/${input.target}` } }],
      };
      const created = await this.#client.createRelatedPerson(rp);
      return { id: created.id ?? "" };
    });
  }

  async endRelationship(id: string, ctx: ProviderContext): Promise<void> {
    this.#requireWrites();
    // Resolve the source party first so the audit event is traceable to a party.
    const rp = await this.#client.readRelatedPerson(id);
    if (!rp) throw new PartyNotFoundError("relationship not found");
    const sourcePartyId = rp.patient.reference.split("/").pop();
    await this.#audited("UPDATE", ctx, { partyId: sourcePartyId, detail: "end-relationship" }, async () => {
      const ended: FhirRelatedPerson = {
        ...rp,
        active: false,
        period: { ...(rp.period ?? {}), end: rp.period?.end ?? new Date().toISOString() },
      };
      await this.#client.updateRelatedPerson(id, ended);
    });
  }

  async listVersions(partyId: string, ctx: ProviderContext): Promise<PartyVersionRef[]> {
    return this.#audited("READ", ctx, { partyId, detail: "list-versions" }, async () => {
      const bundle = await this.#client.history(partyId);
      const versions = (bundle.entry ?? [])
        .map((e) => e.resource)
        .filter((r) => r !== undefined)
        .map((r) => {
          const v = Number.parseInt(r.meta?.versionId ?? "1", 10);
          return { version: Number.isFinite(v) && v > 0 ? v : 1, committedAt: r.meta?.lastUpdated ?? "" };
        });
      return versions.sort((a, b) => a.version - b.version);
    });
  }
}
