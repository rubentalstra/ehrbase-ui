// AuditSink — the NEN-7513 audit port every demographic adapter emits through
// (Inviolable rule 1 + ADR-0031). The adapter packages cannot import the app's
// `logAudit()` (it lives in apps/web/src/server/audit and pulls in Drizzle +
// node:crypto + the chain head in Valkey); so the audit dependency is INJECTED
// as this small port. apps/web wires the real `logAudit`-backed sink in the
// provider factory (mapping a PartyAuditEvent → a `resourceType: 'PARTY'` NEN
// event with `source.adapterName`); the contract suite injects a recording fake.
//
// PHI rule (CLAUDE.md rule 2): a PartyAuditEvent carries NO clinical-identifying
// free text — the internal party id is an opaque uuid, and a national identifier
// only ever appears as its HMAC-SHA256 pseudonym (`subjectIdHash`). `detail` is a
// fixed machine tag (e.g. "search:identifier"), never a name / DOB / raw id.

import type { ProviderContext } from "./provider.ts";

/** The audit verbs a demographic provider emits. apps/web maps these to the NEN-7513 AuditAction enum. */
export type PartyAuditAction = "READ" | "QUERY" | "CREATE" | "UPDATE" | "DELETE" | "ADMIN_CHANGE";

export interface PartyAuditEvent {
  action: PartyAuditAction;
  /** Internal (opaque) party id the op touched, when one is in scope. */
  partyId?: string;
  /** HMAC-SHA256 pseudonym of a national identifier in scope (never the raw value). */
  subjectIdHash?: string;
  outcome: "SUCCESS" | "FAILURE";
  /** Machine-readable tag only — NEVER PHI (no names, DOB, or raw identifiers). */
  detail?: string;
  ctx: ProviderContext;
}

/** Injected audit dependency. The implementation lands the NEN-7513 row + source.adapterName. */
export interface AuditSink {
  record(event: PartyAuditEvent): Promise<void>;
}
