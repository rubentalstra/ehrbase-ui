// BuiltinDemographicProvider — the default, full-mutation DemographicProvider
// (ADR-0031; arch §M7). Stores VERSIONED_PARTY data in the `demographic`
// Postgres schema (schema.ts) using the hybrid current/history JSONB-snapshot
// model: each mutation appends an immutable whole-party version (openEHR
// VERSIONED_OBJECT semantics — a VERSION<PARTY> snapshots the entire party).
//
// Dependencies are INJECTED (no app coupling, fully testable against PGlite):
//   - db          : a Drizzle Postgres handle (postgres-js in prod, PGlite in tests)
//   - audit       : the NEN-7513 AuditSink port (rule 1 — every PHI op audited)
//   - pseudonymize: HMAC-SHA256 of a national id → subjectIdHash (kept app-side
//                   so the secret never enters this package; ADR-0024/§14.4)
//   - newId/now   : injectable id/clock (Web Crypto randomUUID by default — ADR-0037)
//
// Inviolable rule 12: createParty returns a PartyRef (namespace+id, type PERSON)
// — exactly what EHR_STATUS.subject.external_ref must carry. No demographic data
// ever travels inside a composition.

import { and, count, desc, eq, exists, ilike, isNull } from "drizzle-orm";
import type { PgAsyncDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type { AuditSink, PartyAuditAction } from "../audit.ts";
import { validateIdentifier } from "../identifier/registry.ts";
import {
  CreatePartyInputSchema,
  PartySchema,
  type CreatePartyInput,
  type CreateRelationshipInput,
  type DemographicProvider,
  type DemographicProviderCapabilities,
  type Party,
  type PartyIdentifier,
  type PartyRef,
  type PartySearchQuery,
  type PartySearchResult,
  type PartyVersionRef,
  type ProviderContext,
  type RelationshipRef,
  type UpdatePartyInput,
} from "../provider.ts";
import {
  DemographicValidationError,
  DuplicateIdentifierError,
  PartyNotFoundError,
} from "../errors.ts";
import {
  demographicParty,
  demographicPartyHistory,
  demographicPartyIdentifier,
  demographicPartyName,
  demographicRelationship,
} from "./schema.ts";

// Driver-agnostic base: postgres-js (prod) and PGlite (tests) both extend
// PgAsyncDatabase. We use the core query builder with explicit table imports
// (not the relational db.query.* API), so no schema/relations generic is needed.
export type DemographicDb = PgAsyncDatabase<PgQueryResultHKT>;

export interface BuiltinProviderDeps {
  db: DemographicDb;
  audit: AuditSink;
  /** HMAC-SHA256 of a national identifier → audit subjectIdHash (never stores the raw value). */
  pseudonymize: (value: string) => string;
  /** Stable id generator; defaults to Web Crypto randomUUID (ADR-0037). */
  newId?: () => string;
  /** Injectable clock for deterministic tests; defaults to the wall clock. */
  now?: () => Date;
  /** The PartyRef namespace placed in EHR_STATUS.subject.external_ref (rule 12). Default "demographic". */
  partyRefNamespace?: string;
}

const CAPABILITIES: DemographicProviderCapabilities = {
  supportsMutation: true,
  supportsMerge: true,
  readonly: false,
};

// A unique-violation is Postgres SQLSTATE 23505. PGlite puts `code` on the
// thrown error directly; postgres-js (prod) wraps it — drizzle-orm raises a
// DrizzleQueryError whose `.cause` is the postgres.js error carrying `.code`. So
// walk the cause chain. `in`-narrowing reads `code`/`cause` with no type
// assertion (rule 3). (Verified against the live stack — PGlite alone hid this.)
function isUniqueViolation(err: unknown): boolean {
  let cur: unknown = err;
  while (cur !== null && typeof cur === "object") {
    if ("code" in cur && cur.code === "23505") return true;
    cur = "cause" in cur ? cur.cause : null;
  }
  return false;
}

export class BuiltinDemographicProvider implements DemographicProvider {
  readonly name = "builtin";
  readonly capabilities = CAPABILITIES;

  readonly #db: DemographicDb;
  readonly #audit: AuditSink;
  readonly #pseudonymize: (value: string) => string;
  readonly #newId: () => string;
  readonly #now: () => Date;
  readonly #namespace: string;

  constructor(deps: BuiltinProviderDeps) {
    this.#db = deps.db;
    this.#audit = deps.audit;
    this.#pseudonymize = deps.pseudonymize;
    this.#newId = deps.newId ?? (() => crypto.randomUUID());
    this.#now = deps.now ?? (() => new Date());
    this.#namespace = deps.partyRefNamespace ?? "demographic";
  }

  // ─── helpers ───────────────────────────────────────────────────────────────

  #nowIso(): string {
    return this.#now().toISOString();
  }

  #ref(id: string): PartyRef {
    return { namespace: this.#namespace, id, type: "PERSON" };
  }

  /** First identifier's pseudonym, for the audit subjectIdHash (PHI-safe). */
  #subjectHash(identifiers: readonly PartyIdentifier[]): string | undefined {
    const first = identifiers[0];
    return first ? this.#pseudonymize(`${first.namespace}|${first.value}`) : undefined;
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

  /** Validate identifiers against the registry (reject a malformed KNOWN scheme). */
  #validateIdentifiers(identifiers: readonly PartyIdentifier[]): void {
    for (const ident of identifiers) {
      const { valid, known } = validateIdentifier(ident.namespace, ident.value);
      if (known && !valid) {
        throw new DemographicValidationError(`invalid identifier for namespace ${ident.namespace}`);
      }
    }
  }

  /** Assign a stable identifierId, preserving the id of an unchanged (ns+value) identifier. */
  #reconcileIdentifiers(
    next: readonly PartyIdentifier[],
    prev: readonly PartyIdentifier[],
  ): PartyIdentifier[] {
    return next.map((ident) => {
      if (ident.id) return ident;
      const match = prev.find((p) => p.namespace === ident.namespace && p.value === ident.value);
      return { ...ident, id: match?.id ?? this.#newId() };
    });
  }

  /** Rebuild the extracted CURRENT index rows (identifier + name) for a party. */
  async #reindex(tx: DemographicDb, party: Party): Promise<void> {
    await tx.delete(demographicPartyIdentifier).where(eq(demographicPartyIdentifier.partyId, party.id));
    await tx.delete(demographicPartyName).where(eq(demographicPartyName.partyId, party.id));

    const activeIdentifiers = party.identifiers.filter((i) => !i.end);
    if (activeIdentifiers.length > 0) {
      await tx.insert(demographicPartyIdentifier).values(
        activeIdentifiers.map((i) => ({
          partyId: party.id,
          identifierId: i.id ?? this.#newId(),
          namespace: i.namespace,
          value: i.value,
          start: i.start ?? null,
          end: i.end ?? null,
        })),
      );
    }
    if (party.names.length > 0) {
      await tx.insert(demographicPartyName).values(
        party.names.map((n, seq) => ({
          partyId: party.id,
          seq,
          use: n.use ?? null,
          family: n.family ?? null,
          given: n.given.join(" ") || null,
        })),
      );
    }
  }

  /** Insert the CURRENT row as version 1. */
  async #insertCurrent(tx: DemographicDb, party: Party, ctx: ProviderContext): Promise<void> {
    await tx.insert(demographicParty).values({
      id: party.id,
      version: party.version,
      active: party.active,
      gender: party.gender ?? null,
      birthDate: party.birthDate ?? null,
      deceased: party.deceased === undefined ? null : String(party.deceased),
      snapshot: party,
      mergedInto: null,
      committedAt: this.#nowIso(),
      committerUserId: ctx.actor.userId,
      committerDisplayName: ctx.actor.displayName,
      changeType: "creation",
      changeDescription: null,
    });
    await this.#reindex(tx, party);
  }

  /**
   * Append a new immutable version: copy the loaded CURRENT row into history,
   * then overwrite CURRENT with `next` and rebuild the index. Caller supplies a
   * transaction-scoped db.
   */
  async #commitVersion(
    tx: DemographicDb,
    currentRow: typeof demographicParty.$inferSelect,
    next: Party,
    changeType: "modification" | "deletion",
    changeDescription: string | null,
    mergedInto: string | null,
    ctx: ProviderContext,
  ): Promise<void> {
    await tx.insert(demographicPartyHistory).values({
      id: currentRow.id,
      version: currentRow.version,
      active: currentRow.active,
      gender: currentRow.gender,
      birthDate: currentRow.birthDate,
      deceased: currentRow.deceased,
      snapshot: currentRow.snapshot,
      mergedInto: currentRow.mergedInto,
      committedAt: currentRow.committedAt,
      committerUserId: currentRow.committerUserId,
      committerDisplayName: currentRow.committerDisplayName,
      changeType: currentRow.changeType,
      changeDescription: currentRow.changeDescription,
    });
    await tx
      .update(demographicParty)
      .set({
        version: next.version,
        active: next.active,
        gender: next.gender ?? null,
        birthDate: next.birthDate ?? null,
        deceased: next.deceased === undefined ? null : String(next.deceased),
        snapshot: next,
        mergedInto,
        committedAt: this.#nowIso(),
        committerUserId: ctx.actor.userId,
        committerDisplayName: ctx.actor.displayName,
        changeType,
        changeDescription,
      })
      .where(eq(demographicParty.id, next.id));
    await this.#reindex(tx, next);
  }

  async #loadCurrentRow(id: string): Promise<typeof demographicParty.$inferSelect | null> {
    const rows = await this.#db
      .select()
      .from(demographicParty)
      .where(eq(demographicParty.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  // ─── DemographicProvider ─────────────────────────────────────────────────────

  async createParty(input: CreatePartyInput, ctx: ProviderContext): Promise<PartyRef> {
    // Validate + normalise at the boundary (§15) so array defaults (addresses /
    // contacts) are applied even for a direct, partially-shaped programmatic call.
    const norm = CreatePartyInputSchema.parse(input);
    this.#validateIdentifiers(norm.identifiers);
    const id = this.#newId();
    const identifiers = this.#reconcileIdentifiers(norm.identifiers, []);
    const party: Party = PartySchema.parse({
      id,
      active: true,
      version: 1,
      identifiers,
      names: norm.names,
      gender: norm.gender,
      birthDate: norm.birthDate,
      deceased: norm.deceased,
      addresses: norm.addresses,
      contacts: norm.contacts,
    });

    return this.#audited(
      "CREATE",
      ctx,
      { partyId: id, subjectIdHash: this.#subjectHash(identifiers) },
      async () => {
        try {
          await this.#db.transaction(async (tx) => {
            await this.#insertCurrent(tx, party, ctx);
          });
        } catch (err) {
          if (isUniqueViolation(err)) throw new DuplicateIdentifierError(undefined, { cause: err });
          throw err;
        }
        return this.#ref(id);
      },
    );
  }

  async updateParty(id: string, input: UpdatePartyInput, ctx: ProviderContext): Promise<PartyRef> {
    const current = await this.#loadCurrentRow(id);
    if (!current) throw new PartyNotFoundError();
    const prev = PartySchema.parse(current.snapshot);

    const nextIdentifiers =
      input.identifiers !== undefined
        ? this.#reconcileIdentifiers(input.identifiers, prev.identifiers)
        : prev.identifiers;
    this.#validateIdentifiers(nextIdentifiers);

    const next: Party = PartySchema.parse({
      ...prev,
      version: prev.version + 1,
      identifiers: nextIdentifiers,
      names: input.names ?? prev.names,
      gender: input.gender ?? prev.gender,
      birthDate: input.birthDate ?? prev.birthDate,
      deceased: input.deceased ?? prev.deceased,
      addresses: input.addresses ?? prev.addresses,
      contacts: input.contacts ?? prev.contacts,
    });

    return this.#audited(
      "UPDATE",
      ctx,
      { partyId: id, subjectIdHash: this.#subjectHash(nextIdentifiers) },
      async () => {
        try {
          await this.#db.transaction(async (tx) => {
            await this.#commitVersion(tx, current, next, "modification", null, current.mergedInto, ctx);
          });
        } catch (err) {
          if (isUniqueViolation(err)) throw new DuplicateIdentifierError(undefined, { cause: err });
          throw err;
        }
        return this.#ref(id);
      },
    );
  }

  async getParty(
    id: string,
    opts: { version?: number },
    ctx: ProviderContext,
  ): Promise<Party | null> {
    return this.#audited("READ", ctx, { partyId: id }, async () => {
      const current = await this.#loadCurrentRow(id);
      if (!current) return null;
      if (opts.version === undefined || opts.version === current.version) {
        return PartySchema.parse(current.snapshot);
      }
      const rows = await this.#db
        .select()
        .from(demographicPartyHistory)
        .where(
          and(
            eq(demographicPartyHistory.id, id),
            eq(demographicPartyHistory.version, opts.version),
          ),
        )
        .limit(1);
      const row = rows[0];
      return row ? PartySchema.parse(row.snapshot) : null;
    });
  }

  async searchParty(query: PartySearchQuery, ctx: ProviderContext): Promise<PartySearchResult> {
    const conditions = [eq(demographicParty.active, true)];
    const detailParts: string[] = [];
    let subjectIdHash: string | undefined;

    if (query.identifier) {
      detailParts.push("identifier");
      subjectIdHash = this.#pseudonymize(`${query.identifier.namespace}|${query.identifier.value}`);
      conditions.push(
        exists(
          this.#db
            .select({ one: demographicPartyIdentifier.partyId })
            .from(demographicPartyIdentifier)
            .where(
              and(
                eq(demographicPartyIdentifier.partyId, demographicParty.id),
                eq(demographicPartyIdentifier.namespace, query.identifier.namespace),
                eq(demographicPartyIdentifier.value, query.identifier.value),
                isNull(demographicPartyIdentifier.end),
              ),
            ),
        ),
      );
    }
    if (query.family) {
      detailParts.push("family");
      conditions.push(
        exists(
          this.#db
            .select({ one: demographicPartyName.partyId })
            .from(demographicPartyName)
            .where(
              and(
                eq(demographicPartyName.partyId, demographicParty.id),
                ilike(demographicPartyName.family, `${query.family}%`),
              ),
            ),
        ),
      );
    }
    if (query.given) {
      detailParts.push("given");
      conditions.push(
        exists(
          this.#db
            .select({ one: demographicPartyName.partyId })
            .from(demographicPartyName)
            .where(
              and(
                eq(demographicPartyName.partyId, demographicParty.id),
                ilike(demographicPartyName.given, `%${query.given}%`),
              ),
            ),
        ),
      );
    }
    if (query.birthDate) {
      detailParts.push("birthDate");
      conditions.push(eq(demographicParty.birthDate, query.birthDate));
    }

    const where = and(...conditions);
    return this.#audited(
      "QUERY",
      ctx,
      { subjectIdHash, detail: `search:${detailParts.join("+") || "all"}` },
      async () => {
        const totalRows = await this.#db
          .select({ value: count() })
          .from(demographicParty)
          .where(where);
        const total = totalRows[0]?.value ?? 0;

        const rows = await this.#db
          .select()
          .from(demographicParty)
          .where(where)
          .orderBy(desc(demographicParty.committedAt))
          .limit(query.limit)
          .offset(query.offset);

        return { parties: rows.map((r) => PartySchema.parse(r.snapshot)), total };
      },
    );
  }

  async deactivateParty(id: string, justification: string, ctx: ProviderContext): Promise<void> {
    const current = await this.#loadCurrentRow(id);
    if (!current) throw new PartyNotFoundError();
    const prev = PartySchema.parse(current.snapshot);
    const next: Party = PartySchema.parse({ ...prev, active: false, version: prev.version + 1 });

    await this.#audited(
      "DELETE",
      ctx,
      { partyId: id, subjectIdHash: this.#subjectHash(prev.identifiers), detail: "deactivate" },
      async () => {
        await this.#db.transaction(async (tx) => {
          await this.#commitVersion(tx, current, next, "deletion", justification, current.mergedInto, ctx);
          // Free the identifiers so a deactivated party's national id can be reassigned.
          await tx
            .delete(demographicPartyIdentifier)
            .where(eq(demographicPartyIdentifier.partyId, id));
        });
      },
    );
  }

  async mergeParty(into: string, from: string, ctx: ProviderContext): Promise<void> {
    if (into === from) throw new DemographicValidationError("cannot merge a party into itself");
    const target = await this.#loadCurrentRow(into);
    if (!target) throw new PartyNotFoundError("merge target not found");
    const source = await this.#loadCurrentRow(from);
    if (!source) throw new PartyNotFoundError("merge source not found");
    const prev = PartySchema.parse(source.snapshot);
    const next: Party = PartySchema.parse({ ...prev, active: false, version: prev.version + 1 });

    await this.#audited(
      "ADMIN_CHANGE",
      ctx,
      { partyId: from, subjectIdHash: this.#subjectHash(prev.identifiers), detail: "merge" },
      async () => {
        await this.#db.transaction(async (tx) => {
          await this.#commitVersion(tx, source, next, "deletion", `merged into ${into}`, into, ctx);
          await tx
            .delete(demographicPartyIdentifier)
            .where(eq(demographicPartyIdentifier.partyId, from));
        });
      },
    );
  }

  async addIdentifier(
    partyId: string,
    namespace: string,
    value: string,
    ctx: ProviderContext,
  ): Promise<void> {
    const current = await this.#loadCurrentRow(partyId);
    if (!current) throw new PartyNotFoundError();
    const prev = PartySchema.parse(current.snapshot);
    const added: PartyIdentifier = { namespace, value, id: this.#newId() };
    this.#validateIdentifiers([added]);
    const next: Party = PartySchema.parse({
      ...prev,
      version: prev.version + 1,
      identifiers: [...prev.identifiers, added],
    });

    await this.#audited(
      "UPDATE",
      ctx,
      { partyId, subjectIdHash: this.#pseudonymize(`${namespace}|${value}`), detail: "add-identifier" },
      async () => {
        try {
          await this.#db.transaction(async (tx) => {
            await this.#commitVersion(tx, current, next, "modification", null, current.mergedInto, ctx);
          });
        } catch (err) {
          if (isUniqueViolation(err)) throw new DuplicateIdentifierError(undefined, { cause: err });
          throw err;
        }
      },
    );
  }

  async endIdentifier(partyId: string, identifierId: string, ctx: ProviderContext): Promise<void> {
    const current = await this.#loadCurrentRow(partyId);
    if (!current) throw new PartyNotFoundError();
    const prev = PartySchema.parse(current.snapshot);
    const endIso = this.#nowIso();
    const next: Party = PartySchema.parse({
      ...prev,
      version: prev.version + 1,
      identifiers: prev.identifiers.map((i) =>
        i.id === identifierId ? { ...i, end: i.end ?? endIso } : i,
      ),
    });

    await this.#audited(
      "UPDATE",
      ctx,
      { partyId, detail: "end-identifier" },
      async () => {
        await this.#db.transaction(async (tx) => {
          await this.#commitVersion(tx, current, next, "modification", null, current.mergedInto, ctx);
        });
      },
    );
  }

  async addRelationship(
    input: CreateRelationshipInput,
    ctx: ProviderContext,
  ): Promise<RelationshipRef> {
    const id = this.#newId();
    return this.#audited(
      "UPDATE",
      ctx,
      { partyId: input.source, detail: "add-relationship" },
      async () => {
        await this.#db.insert(demographicRelationship).values({
          id,
          sourcePartyId: input.source,
          targetPartyId: input.target,
          type: input.type,
          start: input.start ?? null,
          end: input.end ?? null,
        });
        return { id };
      },
    );
  }

  async endRelationship(id: string, ctx: ProviderContext): Promise<void> {
    // Resolve the source party first so the NEN-7513 event is traceable to a
    // party (a "all ops on party X" query must surface relationship lifecycle).
    const rows = await this.#db
      .select({ source: demographicRelationship.sourcePartyId })
      .from(demographicRelationship)
      .where(eq(demographicRelationship.id, id))
      .limit(1);
    await this.#audited("UPDATE", ctx, { partyId: rows[0]?.source, detail: "end-relationship" }, async () => {
      await this.#db
        .update(demographicRelationship)
        .set({ end: this.#nowIso() })
        .where(eq(demographicRelationship.id, id));
    });
  }

  async listVersions(partyId: string, ctx: ProviderContext): Promise<PartyVersionRef[]> {
    return this.#audited("READ", ctx, { partyId, detail: "list-versions" }, async () => {
      const current = await this.#loadCurrentRow(partyId);
      if (!current) throw new PartyNotFoundError();
      const history = await this.#db
        .select({
          version: demographicPartyHistory.version,
          committedAt: demographicPartyHistory.committedAt,
        })
        .from(demographicPartyHistory)
        .where(eq(demographicPartyHistory.id, partyId));
      const all: PartyVersionRef[] = [
        ...history.map((h) => ({ version: h.version, committedAt: h.committedAt })),
        { version: current.version, committedAt: current.committedAt },
      ];
      return all.sort((a, b) => a.version - b.version);
    });
  }
}
