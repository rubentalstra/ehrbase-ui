// createServerFn contract for DV_MULTIMEDIA file upload (§7.x, Tranche 1e).
// CLIENT-IMPORTABLE BOUNDARY: owns the result type; upload.server.ts runs the
// multipart read + sniff + ClamAV scan + EXIF strip + audit.
//
// The file arrives as multipart FormData (field `file`, optional `alternateText`)
// — read from the request in the .server impl, so there is no inputValidator
// here. On success it returns the scanned, metadata-stripped bytes (base64) +
// the sniffed media type + a SHA-256 integrity check, ready to be embedded as an
// inline DV_MULTIMEDIA in the composition write (1c). Infected / disallowed /
// oversized files throw a generic typed error — the virus name is NEVER returned
// to the client (§7.x), only audited.

import { createServerFn } from "@tanstack/react-start";

export interface UploadResult {
  /** Sniffed (not client-declared) media type, from the §7.x allow-list. */
  mediaType: string;
  size: number;
  /** SHA-256 hex of the cleaned bytes → DV_MULTIMEDIA.integrity_check. */
  sha256: string;
  /** base64 of the virus-scanned, EXIF-stripped bytes for inline DV_MULTIMEDIA.data. */
  data: string;
  alternateText: string;
}

export const uploadAttachment = createServerFn({ method: "POST" }).handler(
  async (): Promise<UploadResult> => {
    const { handleUpload } = await import("./upload.server");
    return handleUpload();
  },
);
