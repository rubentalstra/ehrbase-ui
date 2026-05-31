// Server-only encrypted draft autosave (§7 form pipeline, Tranche 1d).
//
// Stores in-progress composition form-state in Valkey, ENCRYPTED at rest
// (XChaCha20-Poly1305 via @/server/crypto/field-encryption), 24h TTL, keyed by
// user+template+ehr. Contract/types live in drafts.functions.ts (CLAUDE.md
// rules 7+8).

import { valkey } from "@ehrbase-ui/valkey";
import { z } from "zod";

import { auth as betterAuth } from "@/lib/auth/auth.server";
import { decryptString, encryptString } from "@/server/crypto/field-encryption.server";

import type {
  DiscardDraftResult,
  DraftKeyInput,
  GetDraftResult,
  SaveDraftInput,
  SaveDraftResult,
} from "./drafts.functions";

const DRAFT_TTL_SECONDS = 86_400; // 24h — abandoned drafts expire on their own.
// Valkey value: savedAt readable (resume UX, not PHI) + the encrypted form-state.
const DraftEnvelopeSchema = z.object({ savedAt: z.string(), data: z.string() });

function fail(status: number, code: string): Response {
  return new Response(JSON.stringify({ code }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function requireUserId(): Promise<string> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const session = await betterAuth.api.getSession({ headers: getRequest().headers });
  if (!session) throw fail(401, "UNAUTHENTICATED");
  return session.user.id;
}

const draftKey = (userId: string, templateId: string, ehrId: string): string =>
  `draft:${userId}:${templateId}:${ehrId}`;

export async function storeDraft(input: SaveDraftInput): Promise<SaveDraftResult> {
  const userId = await requireUserId();
  const savedAt = new Date().toISOString();
  const envelope = JSON.stringify({
    savedAt,
    data: encryptString(JSON.stringify(input.formState)),
  });
  await valkey.setex(draftKey(userId, input.templateId, input.ehrId), DRAFT_TTL_SECONDS, envelope);
  return { savedAt };
}

export async function readDraft(input: DraftKeyInput): Promise<GetDraftResult> {
  const userId = await requireUserId();
  const raw = await valkey.get(draftKey(userId, input.templateId, input.ehrId));
  if (raw === null) return { formState: null, savedAt: null };
  // A parse/decrypt failure means corrupt or tampered Valkey data (AEAD tag
  // mismatch). Return a generic error — never let the raw crypto/JSON error
  // message reach the client.
  let env: { savedAt: string; data: string };
  let formState: string;
  try {
    env = DraftEnvelopeSchema.parse(JSON.parse(raw));
    formState = decryptString(env.data);
  } catch {
    throw fail(422, "DRAFT_UNAVAILABLE");
  }
  return { formState, savedAt: env.savedAt };
}

export async function removeDraft(input: DraftKeyInput): Promise<DiscardDraftResult> {
  const userId = await requireUserId();
  const removed = await valkey.del(draftKey(userId, input.templateId, input.ehrId));
  return { deleted: removed > 0 };
}
