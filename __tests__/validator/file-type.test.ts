import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { FileType } from "../../src/validator/file-type";

describe("FileType Validator", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "file-type-test-"));
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  });

  // Minimal magic-byte fixtures
  const fixtures: Record<string, Buffer> = {
    "image.jpg": Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    "image.png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    "anim.gif": Buffer.from("GIF89a...."),
    "data.bin": Buffer.from([0x00, 0x01, 0x02, 0x03]),
  };

  const paths: Record<string, string> = {};

  beforeAll(async () => {
    for (const [name, buffer] of Object.entries(fixtures)) {
      paths[name] = path.join(tempDir, name);
      await writeFile(paths[name]!, buffer);
    }
  });

  test("detects real content types by magic bytes", async () => {
    const images = new FileType([
      FileType.FILE_TYPE_JPEG,
      FileType.FILE_TYPE_PNG,
      FileType.FILE_TYPE_GIF,
    ]);

    expect(await images.isValid(paths["image.jpg"]!)).toBe(true);
    expect(await images.isValid(paths["image.png"]!)).toBe(true);
    expect(await images.isValid(paths["anim.gif"]!)).toBe(true);
    expect(await images.isValid(paths["data.bin"]!)).toBe(false);
  });

  test("rejects when no allowed type matches", async () => {
    const gzipOnly = new FileType([FileType.FILE_TYPE_GZIP]);
    expect(await gzipOnly.isValid(paths["image.jpg"]!)).toBe(false);
  });

  test("returns false for missing files", async () => {
    const validator = new FileType([FileType.FILE_TYPE_JPEG]);
    expect(await validator.isValid(path.join(tempDir, "missing.jpg"))).toBe(false);
  });

  test("throws on unknown type constants", () => {
    expect(() => new FileType(["exe" as never])).toThrow("Unknown file mime type");
  });
});
