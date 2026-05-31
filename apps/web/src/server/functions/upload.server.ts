// Server-only DV_MULTIMEDIA upload handler (§7.x, Tranche 1e).
//
// Multipart → in-memory buffer → sniff media type (allow-list) →
// (allowed) strip JPEG EXIF + SHA-256 → return inline-attachment descriptor;
// (disallowed/oversized) generic typed error.

import { createHash } from "node:crypto";

import { auth as betterAuth } from "@/lib/auth/auth.server";
import { sniffMediaType, stripJpegMetadata } from "@/server/upload/media.server";

import type { UploadResult } from "./upload.functions";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB cap (§7.x)

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

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw fail(400, "NO_FILE");
  const altField = form.get("alternateText");
  const alternateText = typeof altField === "string" ? altField : "";

  // Cap BEFORE buffering the bytes.
  if (file.size > MAX_UPLOAD_BYTES) throw fail(413, "FILE_TOO_LARGE");

  const buf = Buffer.from(await file.arrayBuffer());

  // Sniff magic bytes — never trust the client-declared type.
  const mediaType = sniffMediaType(buf);
  if (!mediaType) throw fail(415, "UNSUPPORTED_MEDIA_TYPE");

  const clean = mediaType === "image/jpeg" ? stripJpegMetadata(buf) : buf;
  const sha256 = createHash("sha256").update(clean).digest("hex");

  return { mediaType, size: clean.length, sha256, data: clean.toString("base64"), alternateText };
}
