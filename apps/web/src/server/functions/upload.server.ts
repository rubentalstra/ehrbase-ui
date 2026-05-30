// Server-only DV_MULTIMEDIA upload handler (§7.x, Tranche 1e).
//
// Multipart → in-memory buffer → sniff media type (allow-list) → ClamAV scan →
// (clean) strip JPEG EXIF + SHA-256 → return inline-attachment descriptor;
// (infected/disallowed/oversized) generic typed error + audit. The virus name
// is recorded in the audit trail ONLY, never returned to the user (§7.x). Every
// path emits a NEN-7513 audit row (CLAUDE.md rule 1) with NO PHI — no filename
// (filenames routinely carry patient identifiers — rule 2), only the outcome
// tag, sniffed media type, and ClamAV signature on a hit.

import { createHash } from "node:crypto";

import { z } from "zod";

import { auth as betterAuth } from "@/lib/auth/auth.server";
import type { AuditAction, AuditOutcome } from "@/server/audit";
import { logAudit } from "@/server/audit/runtime";
import { scanBuffer } from "@/server/upload/clamav.server";
import { sniffMediaType, stripJpegMetadata } from "@/server/upload/media.server";

import type { UploadResult } from "./upload.functions";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB cap (§7.x)
const UserShapeSchema = z.object({ keycloakRoles: z.array(z.string()).default([]) }).partial();

interface UploadActor {
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

export async function handleUpload(): Promise<UploadResult> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const request = getRequest();
  const session = await betterAuth.api.getSession({ headers: request.headers });
  if (!session) throw fail(401, "UNAUTHENTICATED");
  const shape = UserShapeSchema.safeParse(session.user);
  const actor: UploadActor = {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? "",
    roles: shape.success ? (shape.data.keycloakRoles ?? []) : [],
    sid: session.session.token,
  };

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw fail(400, "NO_FILE");
  const altField = form.get("alternateText");
  const alternateText = typeof altField === "string" ? altField : "";

  // Cap BEFORE buffering the bytes.
  if (file.size > MAX_UPLOAD_BYTES) {
    await audit(actor, "FAILURE", "upload_too_large");
    throw fail(413, "FILE_TOO_LARGE");
  }

  const buf = Buffer.from(await file.arrayBuffer());

  // Sniff magic bytes — never trust the client-declared type.
  const mediaType = sniffMediaType(buf);
  if (!mediaType) {
    await audit(actor, "FAILURE", "upload_rejected_type");
    throw fail(415, "UNSUPPORTED_MEDIA_TYPE");
  }

  // Fail CLOSED: if the scanner is unreachable / times out, reject the upload
  // (never accept unscanned PHI-bearing bytes) + audit. The raw clamd/transport
  // error must not reach the client (§10 rule 2).
  let scan;
  try {
    scan = await scanBuffer(buf);
  } catch {
    await audit(actor, "FAILURE", "scanner_unavailable");
    throw fail(503, "SCAN_UNAVAILABLE");
  }
  if (!scan.clean) {
    // Virus name → audit only; the user gets a generic message (§7.x).
    await audit(actor, "FAILURE", `upload_infected:${scan.signature ?? "unknown"}`);
    throw fail(422, "FILE_REJECTED");
  }

  const clean = mediaType === "image/jpeg" ? stripJpegMetadata(buf) : buf;
  const sha256 = createHash("sha256").update(clean).digest("hex");
  await audit(actor, "SUCCESS", "upload_scanned");

  return { mediaType, size: clean.length, sha256, data: clean.toString("base64"), alternateText };
}

async function audit(actor: UploadActor, outcome: AuditOutcome, detail: string): Promise<void> {
  const action: AuditAction = "CREATE";
  await logAudit({
    actor: { userId: actor.id, username: actor.email, displayName: actor.name, roles: actor.roles },
    action,
    target: { resourceType: "COMPOSITION" },
    purpose: "TREATMENT",
    outcome,
    outcomeDetail: detail,
    source: { sessionId: actor.sid },
  });
}
