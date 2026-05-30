// createServerFn contract for EHR lifecycle (Part C Phase 1 — engine-first
// workbench). EHRbase implements only the EHR side of openEHR; these wrap the
// ITS-REST EHR + EHR_STATUS endpoints. CLIENT-IMPORTABLE BOUNDARY: owns the
// input schemas + output types; the .server.ts beside it makes the EHRbase call
// (CLAUDE.md rules 7+8).
//
// EHR_STATUS bodies cross the wire as JSON strings (z.json on the way in,
// stringified on the way out) for the same reason composition form-state does:
// canonical openEHR JSON is an open object that doesn't satisfy createServerFn's
// serializable-return constraint, and the consumer re-parses it.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Rule 12: an EHR's subject is a PARTY reference into the demographic provider,
// never inline demographics. Optional here — the workbench can create a bare EHR
// and bind the subject later (patient enrolment, Phase 2).
export const EhrSubjectSchema = z.object({
  namespace: z.string().min(1),
  id: z.string().min(1),
});
export type EhrSubject = z.infer<typeof EhrSubjectSchema>;

export const CreateEhrInputSchema = z.object({ subject: EhrSubjectSchema.optional() });
export type CreateEhrInput = z.infer<typeof CreateEhrInputSchema>;

export const EhrIdInputSchema = z.object({ ehrId: z.uuid() });
export type EhrIdInput = z.infer<typeof EhrIdInputSchema>;

export const UpdateEhrStatusInputSchema = z.object({
  ehrId: z.uuid(),
  // Full version_uid of the EHR_STATUS version being replaced (If-Match).
  versionUid: z.string().min(1),
  ehrStatus: z.json(),
});
export type UpdateEhrStatusInput = z.infer<typeof UpdateEhrStatusInputSchema>;

// ─── Output contracts ─────────────────────────────────────────────────────────
export interface CreateEhrResult {
  ehrId: string;
}
export interface GetEhrResult {
  ehrId: string;
  systemId: string | null;
  timeCreated: string | null;
}
export interface GetEhrStatusResult {
  /** The EHR_STATUS canonical object as a JSON string; consumer parses it. */
  ehrStatus: string;
  versionUid: string;
}
export interface UpdateEhrStatusResult {
  versionUid: string;
}

// ─── Server fns ───────────────────────────────────────────────────────────────
export const createEhr = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => CreateEhrInputSchema.parse(d))
  .handler(async ({ data }): Promise<CreateEhrResult> => {
    const { createEhrImpl } = await import("./ehr.server");
    return createEhrImpl(data);
  });

export const getEhr = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => EhrIdInputSchema.parse(d))
  .handler(async ({ data }): Promise<GetEhrResult> => {
    const { fetchEhr } = await import("./ehr.server");
    return fetchEhr(data);
  });

export const getEhrStatus = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => EhrIdInputSchema.parse(d))
  .handler(async ({ data }): Promise<GetEhrStatusResult> => {
    const { fetchEhrStatus } = await import("./ehr.server");
    return fetchEhrStatus(data);
  });

export const updateEhrStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => UpdateEhrStatusInputSchema.parse(d))
  .handler(async ({ data }): Promise<UpdateEhrStatusResult> => {
    const { reviseEhrStatus } = await import("./ehr.server");
    return reviseEhrStatus(data);
  });
