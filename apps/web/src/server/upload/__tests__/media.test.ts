import { describe, expect, it } from "vitest";

import { parseClamdReply } from "../clamav.server.ts";
import { sniffMediaType, stripJpegMetadata } from "../media.server.ts";

describe("sniffMediaType", () => {
  it("recognises the allow-listed types by magic bytes", () => {
    expect(sniffMediaType(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe("application/pdf");
    expect(sniffMediaType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMediaType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      "image/png",
    );
    expect(sniffMediaType(Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe("image/gif");
    expect(sniffMediaType(Buffer.from([0x49, 0x49, 0x2a, 0x00]))).toBe("image/tiff");
  });

  it("recognises DICOM by the DICM marker at offset 128", () => {
    const dicom = Buffer.alloc(140);
    dicom.write("DICM", 128, "ascii");
    expect(sniffMediaType(dicom)).toBe("application/dicom");
  });

  it("rejects anything not on the allow-list (e.g. a script or ZIP)", () => {
    expect(sniffMediaType(Buffer.from("#!/bin/sh\nrm -rf /"))).toBeNull();
    expect(sniffMediaType(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBeNull(); // ZIP
    expect(sniffMediaType(Buffer.from([]))).toBeNull();
  });
});

describe("stripJpegMetadata", () => {
  it("removes the APP1/EXIF segment but keeps APP0 + scan data", () => {
    // SOI, APP0(JFIF len2), APP1(EXIF len2), SOS + scan
    const jpeg = Buffer.from([
      0xff, 0xd8, // SOI
      0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, // APP0 len=4 (2 length + 2 data "JF")
      0xff, 0xe1, 0x00, 0x05, 0x45, 0x78, 0x69, // APP1 len=5 (EXIF: "Exi")
      0xff, 0xda, 0x00, 0x03, 0xaa, // SOS len=3 + 1 scan byte
      0x12, 0x34, // trailing scan bytes
    ]);
    const out = stripJpegMetadata(jpeg);
    // APP1 marker (ff e1) must be gone; APP0 (ff e0) + SOS (ff da) preserved.
    expect(out.includes(Buffer.from([0xff, 0xe1]))).toBe(false);
    expect(out.includes(Buffer.from([0xff, 0xe0]))).toBe(true);
    expect(out.includes(Buffer.from([0xff, 0xda]))).toBe(true);
    expect(out.includes(Buffer.from([0x45, 0x78, 0x69]))).toBe(false); // "Exi" gone
    expect(out.includes(Buffer.from([0x12, 0x34]))).toBe(true); // scan tail intact
  });

  it("returns non-JPEG input unchanged", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(stripJpegMetadata(png).equals(png)).toBe(true);
  });
});

describe("parseClamdReply", () => {
  it("reads a clean stream", () => {
    expect(parseClamdReply("stream: OK\0")).toEqual({ clean: true });
  });

  it("extracts the signature on a hit", () => {
    expect(parseClamdReply("stream: Eicar-Test-Signature FOUND\0")).toEqual({
      clean: false,
      signature: "Eicar-Test-Signature",
    });
  });

  it("throws on a clamd error reply", () => {
    expect(() => parseClamdReply("INSTREAM size limit exceeded ERROR")).toThrow();
  });
});
