// Pure checks for uploaded attachments, shared by the API and the tests.

/**
 * The file's real type from its first bytes: PDF or an image every browser can show. The type the
 * browser sent is ignored, so nothing else (HTML, SVG) can be uploaded and then opened from our origin.
 */
export function sniffType(bytes: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

/** A file name that is safe to store and show: no path, no control characters, at most 120 characters. */
export function cleanName(name: string, contentType: string): string {
  const base = name.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f"]/g, "").trim();
  if (base) return base.length > 120 ? base.slice(0, 120) : base;
  return contentType === "application/pdf" ? "attachment.pdf" : `attachment.${contentType.slice(6)}`;
}
