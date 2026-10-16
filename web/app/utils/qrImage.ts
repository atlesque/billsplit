import { encode } from "uqr";

// Renders a QR code as a PNG, dark on white with a quiet zone, for banking apps that read QR codes from images.
export function qrPng(value: string, scale = 12): Promise<Blob> {
  const qr = encode(value, { ecc: "M", border: 4 });
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = qr.size * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  qr.data.forEach((row, y) => row.forEach((dark, x) => dark && ctx.fillRect(x * scale, y * scale, scale, scale)));
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("QR image failed"))), "image/png"));
}
