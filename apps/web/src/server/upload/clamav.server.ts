// ClamAV virus scanning for DV_MULTIMEDIA uploads (§7.x). Talks the clamd
// INSTREAM protocol over TCP to the sidecar container (CLAMAV_HOST:CLAMAV_PORT),
// so ClamAV's GPLv2 stays fenced from our Apache-2.0 process.
//
// INSTREAM wire format: send "zINSTREAM\0", then a sequence of chunks each
// prefixed by a 4-byte big-endian length, terminated by a zero-length chunk.
// clamd replies "stream: OK" / "stream: <Signature> FOUND" / "... ERROR".
//
// `.server.ts` (CLAUDE.md rule 7): never reaches the client bundle.

import net from "node:net";

export interface ScanResult {
  clean: boolean;
  /** ClamAV signature name on a hit — for the AUDIT trail only, never shown to the user. */
  signature?: string;
}

const CHUNK_SIZE = 64 * 1024;
const SCAN_TIMEOUT_MS = 30_000;

/** Parse a clamd INSTREAM reply. Exported for unit testing. */
export function parseClamdReply(reply: string): ScanResult {
  const text = reply.replace(/\0+$/u, "").trim();
  if (/\bFOUND\b/u.test(text)) {
    const signature = text.replace(/^stream:\s*/iu, "").replace(/\s*FOUND$/iu, "");
    return { clean: false, signature };
  }
  if (/\bOK\b/u.test(text)) return { clean: true };
  throw new Error(`clamd scan error: ${text || "empty reply"}`);
}

/** Scan an in-memory buffer. Resolves clean/infected; rejects on transport/clamd error. */
export function scanBuffer(buf: Buffer): Promise<ScanResult> {
  const host = process.env.CLAMAV_HOST ?? "127.0.0.1";
  const port = Number(process.env.CLAMAV_PORT ?? "3310");

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const chunks: Buffer[] = [];
    let settled = false;

    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      fn();
    };

    socket.setTimeout(SCAN_TIMEOUT_MS);
    socket.on("timeout", () => finish(() => reject(new Error("clamd scan timed out"))));
    socket.on("error", (err) => finish(() => reject(err)));
    socket.on("data", (d: Buffer | string) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
    socket.on("end", () =>
      finish(() => {
        try {
          resolve(parseClamdReply(Buffer.concat(chunks).toString("utf8")));
        } catch (err) {
          reject(err instanceof Error ? err : new Error("clamd parse error"));
        }
      }),
    );

    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let i = 0; i < buf.length; i += CHUNK_SIZE) {
        const slice = buf.subarray(i, i + CHUNK_SIZE);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(slice.length, 0);
        socket.write(len);
        socket.write(slice);
      }
      const terminator = Buffer.alloc(4); // zero-length chunk ends the stream
      socket.write(terminator);
    });
  });
}
