// Server-only encrypted draft autosave (§7 form pipeline, Tranche 1d).
//
// Stores in-progress composition form-state in Valkey, ENCRYPTED at rest
// (AES-256-GCM via @/server/crypto/field-encryption), 24h TTL, keyed by
// user+template+ehr. Every op emits a NEN-7513 audit row (CLAUDE.md rule 1) with
// NO PHI in the body — only the ehr target + an outcomeDetail tag
// (draft_autosave / draft_resume / draft_discard). Contract/types live in
// drafts.functions.ts (CLAUDE.md rules 7+8).

import { valkey } from "@ehrbase-ui/valkey";
import { z } from "zod";

import { auth as betterAuth } from "@/lib/auth/auth.server";
import type { AuditAction, AuditOutcome } from "@/server/audit";
import { logAudit } from "@/server/audit/runtime";
import { decryptString, encryptString } from "@/server/crypto/field-encryption.server";

import type {
  DiscardDraftResult,
  DraftKeyInput,
  GetDraftResult,
  SaveDraftInput,
  SaveDraftResult,
} from "./drafts.functions";

const DRAFT_TTL_SECONDS = 86_400; // 24h — abandoned drafts expire on their own.
const UserShapeSchema = z.object({ keycloakRoles: z.array(z.string()).default([]) }).partial();
// Valkey value: savedAt readable (resume UX, not PHI) + the encrypted form-state.
const DraftEnvelopeSchema = z.object({ savedAt: z.string(), data: z.string() });

interface DraftActor {
  id: string;
  email: string;
  name: string;
  roles: string[];
  sid: string;
}

function fail(status: number, code: string): Response {
  return new Response(JSON.stringify({ code }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function requireUser(): Promise<DraftActor> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const session = await betterAuth.api.getSession({ headers: getRequest().headers });
  if (!session) throw fail(401, "UNAUTHENTICATED");
  const shape = UserShapeSchema.safeParse(session.user);
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? "",
    roles: shape.success ? (shape.data.keycloakRoles ?? []) : [],
    sid: session.session.token,
  };
}

const draftKey = (userId: string, templateId: string, ehrId: string): string =>
  `draft:${userId}:${templateId}:${ehrId}`;

export async function storeDraft(input: SaveDraftInput): Promise<SaveDraftResult> {
  const user = await requireUser();
  const savedAt = new Date().toISOString();
  const envelope = JSON.stringify({
    savedAt,
    data: encryptString(JSON.stringify(input.formState)),
  });
  await valkey.setex(draftKey(user.id, input.templateId, input.ehrId), DRAFT_TTL_SECONDS, envelope);
  await audit(user, "UPDATE", input.ehrId, "draft_autosave");
  return { savedAt };
}

export async function readDraft(input: DraftKeyInput): Promise<GetDraftResult> {
  const user = await requireUser();
  const raw = await valkey.get(draftKey(user.id, input.templateId, input.ehrId));
  if (raw === null) return { formState: null, savedAt: null };
  // A parse/decrypt failure means corrupt or tampered Valkey data (AEAD tag
  // mismatch). Audit it + return a generic error — never let the raw crypto/JSON
  // error message reach the client (§10 rule 2).
  let env: { savedAt: string; data: string };
  let formState: string;
  try {
    env = DraftEnvelopeSchema.parse(JSON.parse(raw));
    formState = decryptString(env.data);
  } catch {
    await audit(user, "READ", input.ehrId, "draft_corrupt_or_tampered", "FAILURE");
    throw fail(422, "DRAFT_UNAVAILABLE");
  }
  await audit(user, "READ", input.ehrId, "draft_resume");
  return { formState, savedAt: env.savedAt };
}

export async function removeDraft(input: DraftKeyInput): Promise<DiscardDraftResult> {
  const user = await requireUser();
  const removed = await valkey.del(draftKey(user.id, input.templateId, input.ehrId));
  await audit(user, "DELETE", input.ehrId, "draft_discard");
  return { deleted: removed > 0 };
}

async function audit(
  user: DraftActor,
  action: AuditAction,
  ehrId: string,
  detail: string,
  outcome: AuditOutcome = "SUCCESS",
): Promise<void> {
  await logAudit({
    actor: { userId: user.id, username: user.email, displayName: user.name, roles: user.roles },
    action,
    target: { ehrId, resourceType: "COMPOSITION" },
    purpose: "TREATMENT",
    outcome,
    outcomeDetail: detail,
    source: { sessionId: user.sid },
  });
}
