// Media-type sniffing + EXIF stripping for DV_MULTIMEDIA uploads (§7.x).
//
// We NEVER trust a client-supplied Content-Type / filename extension to decide
// what a file is — we sniff the magic bytes and allow only a clinical-document
// allow-list. JPEG EXIF (which routinely carries GPS coordinates + device serial
// numbers — PHI-adjacent) is stripped before the bytes are accepted.
//
// `.server.ts` (CLAUDE.md rule 7): never reaches the client bundle.

// Allow-list of clinical document/image types (openEHR DV_MULTIMEDIA payloads:
// scanned referrals, ECG/wound photos, DICOM). Sniffed, not declared.
export const ALLOWED_MEDIA_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/tiff",
  "application/dicom",
] as const;
export type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

/** Sniff the media type from magic bytes, or null if it is not on the allow-list. */
export function sniffMediaType(buf: Buffer): AllowedMediaType | null {
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46])) return "application/pdf"; // %PDF
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38])) return "image/gif"; // GIF8
  if (startsWith(buf, [0x49, 0x49, 0x2a, 0x00]) || startsWith(buf, [0x4d, 0x4d, 0x00, 0x2a]))
    return "image/tiff"; // II*\0 (LE) / MM\0* (BE)
  if (startsWith(buf, [0x44, 0x49, 0x43, 0x4d], 128)) return "application/dicom"; // "DICM" @128
  return null;
}

// JPEG marker bytes.
const SOI = 0xd8;
const SOS = 0xda;
const APP1 = 0xe1; // EXIF / XMP
const APP13 = 0xed; // Photoshop / IPTC

/**
 * Strip metadata APP segments (EXIF/XMP at APP1, IPTC at APP13) from a JPEG.
 * Other segments — including APP0/JFIF and the compressed scan — are preserved.
 * Non-JPEG input is returned unchanged (sniff gates which types reach here).
 */
export function stripJpegMetadata(buf: Buffer): Buffer {
  if (!startsWith(buf, [0xff, 0xd8, 0xff])) return buf;
  const out: Buffer[] = [buf.subarray(0, 2)]; // SOI
  let i = 2;
  while (i + 3 < buf.length) {
    if (buf[i] !== 0xff) break; // not a marker boundary — bail, keep remainder
    const marker = buf[i + 1];
    if (marker === SOS) {
      out.push(buf.subarray(i)); // start-of-scan + everything after is image data
      return Buffer.concat(out);
    }
    if (marker === SOI) {
      i += 2; // standalone marker, no length
      continue;
    }
    const segLen = buf.readUInt16BE(i + 2); // length includes the 2 length bytes
    const next = i + 2 + segLen;
    if (marker !== APP1 && marker !== APP13) {
      out.push(buf.subarray(i, next)); // keep this segment
    }
    i = next;
  }
  out.push(buf.subarray(i)); // tail (no SOS seen)
  return Buffer.concat(out);
}
