import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { Upload } from "../../src/validator/upload";

describe("Upload Validator", () => {
  let tempDir: string;
  let filePath: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "upload-test-"));
    filePath = path.join(tempDir, "uploaded.txt");
    await writeFile(filePath, "content");
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  });

  test("accepts existing files", async () => {
    expect(await Upload.prototype.isValid.call(new Upload(), filePath)).toBe(true);
  });

  test("rejects missing files", async () => {
    expect(await new Upload().isValid(path.join(tempDir, "missing.txt"))).toBe(false);
  });

  test("rejects non-string input", async () => {
    expect(await new Upload().isValid(42 as unknown as string)).toBe(false);
    expect(await new Upload().isValid(null)).toBe(false);
  });
});
