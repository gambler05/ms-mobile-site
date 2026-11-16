import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "studio-ia-test-"));
}

export function dataUrl(buf: Buffer, mime = "image/png"): string {
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/** JPEG minimal valide (1×1 gris) — suffisant pour les tests de détection. */
export const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAAQABABAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=",
  "base64",
);
