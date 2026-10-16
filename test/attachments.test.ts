import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanName, sniffType } from "../src/files.ts";
import { isSettled } from "../src/split.ts";

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

test("attachments: the type comes from the file's first bytes", () => {
  assert.equal(sniffType(bytes("%PDF-1.7\n")), "application/pdf");
  assert.equal(sniffType(bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(sniffType(bytes([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffType(bytes("GIF89a")), "image/gif");
  assert.equal(sniffType(bytes("RIFF", [1, 2, 3, 4], "WEBPVP8 ")), "image/webp");
  // HTML, SVG and anything else is refused, whatever the browser called it.
  assert.equal(sniffType(bytes("<html><script>")), null);
  assert.equal(sniffType(bytes("<svg xmlns=")), null);
  assert.equal(sniffType(bytes("")), null);
});

test("attachments: file names lose paths and control characters", () => {
  assert.equal(cleanName("C:\\Users\\me\\bon.pdf", "application/pdf"), "bon.pdf");
  assert.equal(cleanName('../"evil"\n.png', "image/png"), "evil.png");
  assert.equal(cleanName("", "image/jpeg"), "attachment.jpeg");
  assert.equal(cleanName("x".repeat(200), "application/pdf").length, 120);
});

test("archive: only a settled group without open payments can be archived", () => {
  const zero = new Map([["a", 0], ["b", 0]]);
  assert.equal(isSettled(zero, []), true);
  assert.equal(isSettled(zero, [{ status: "failed" }, { status: "received" }]), true);
  assert.equal(isSettled(zero, [{ status: "sent" }]), false);
  assert.equal(isSettled(new Map([["a", 500], ["b", -500]]), []), false);
});
