import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { Local } from "../../src/device/local";
import { Storage } from "../../src/storage";
import { StorageError } from "../../src/errors";

describe("Local Device", () => {
  let tempDir: string;
  let device: Local;
  const content = "Hello, World! This is test content.";

  beforeAll(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "local-device-test-"));
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  });

  const uniqueFile = (name = "test.txt") =>
    path.join(tempDir, `${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`);

  describe("Basic Properties", () => {
    test("returns correct metadata", () => {
      device = new Local(tempDir);
      expect(device.getName()).toBe("Local Storage");
      expect(device.getType()).toBe(Storage.DEVICE_LOCAL);
      expect(device.getRoot()).toBe(tempDir);
      expect(device.getDescription()).toContain("local storage");
    });

    test("builds normalized paths", () => {
      device = new Local(tempDir);
      expect(device.getPath("a/b.txt")).toBe(
        device.getAbsolutePath(path.join(tempDir, "a/b.txt")),
      );
    });
  });

  describe("Transfer Chunk Size", () => {
    test("defaults to 20MB and is configurable", () => {
      device = new Local();
      expect(device.getTransferChunkSize()).toBe(20_000_000);
      device.setTransferChunkSize(10_000);
      expect(device.getTransferChunkSize()).toBe(10_000);
    });
  });

  describe("File Operations", () => {
    test("writes and reads back content", async () => {
      device = new Local(tempDir);
      const file = uniqueFile();

      await device.write(file, content);
      expect(await device.read(file)).toEqual(Buffer.from(content));
    });

    test("reads byte ranges with offset and length", async () => {
      device = new Local(tempDir);
      const file = uniqueFile();
      await device.write(file, "0123456789");

      expect((await device.read(file, 2, 3)).toString()).toBe("234");
      expect((await device.read(file, 7)).toString()).toBe("789");
    });

    test("checks existence", async () => {
      device = new Local(tempDir);
      const file = uniqueFile();

      expect(await device.exists(file)).toBe(false);
      await device.write(file, content);
      expect(await device.exists(file)).toBe(true);
    });

    test("throws FILE_NOT_FOUND when reading missing file", async () => {
      device = new Local(tempDir);

      try {
        await device.read(uniqueFile("missing.txt"));
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).code).toBe("FILE_NOT_FOUND");
      }
    });

    test("returns file size", async () => {
      device = new Local(tempDir);
      const file = uniqueFile();
      await device.write(file, content);

      expect(await device.getFileSize(file)).toBe(Buffer.byteLength(content));
    });

    test("detects MIME type via Bun", async () => {
      device = new Local(tempDir);
      const file = uniqueFile("data.json");
      await device.write(file, '{"a":1}');

      expect(await device.getFileMimeType(file)).toBe("application/json");
    });

    test("computes MD5 hash", async () => {
      device = new Local(tempDir);
      const file = uniqueFile();
      await device.write(file, content);

      const hash = await device.getFileHash(file);
      expect(hash).toMatch(/^[a-f0-9]{32}$/);
    });

    test("stat returns size and mime type in one call", async () => {
      device = new Local(tempDir);
      const file = uniqueFile("doc.pdf");
      await device.write(file, "%PDF-1.4 fake");

      const s = await device.stat(file);
      expect(s.size).toBe(Buffer.byteLength("%PDF-1.4 fake"));
      expect(s.mimeType).toBe("application/pdf");
    });

    test("deletes files", async () => {
      device = new Local(tempDir);
      const file = uniqueFile();
      await device.write(file, content);

      expect(await device.delete(file)).toBe(true);
      expect(await device.exists(file)).toBe(false);
    });

    test("moves files atomically", async () => {
      device = new Local(tempDir);
      const source = uniqueFile();
      const target = uniqueFile("moved.txt");

      await device.write(source, content);
      expect(await device.move(source, target)).toBe(true);
      expect(await device.exists(source)).toBe(false);
      expect((await device.read(target)).toString()).toBe(content);
    });

    test("move returns false for identical paths", async () => {
      device = new Local(tempDir);
      expect(await device.move("same.txt", "same.txt")).toBe(false);
    });
  });

  describe("Chunked Uploads", () => {
    test("assembles chunks into the final file", async () => {
      device = new Local(tempDir);
      const file = uniqueFile("chunked.bin");
      const parts = [Buffer.from("AAA"), Buffer.from("BBB"), Buffer.from("CCC")];
      const metadata = {};

      for (let i = 0; i < parts.length; i++) {
        const received = await device.uploadData(parts[i]!, file, "application/octet-stream", i + 1, parts.length, metadata);
        expect(received).toBe(i + 1);
      }

      expect((await device.read(file)).toString()).toBe("AAABBBCCC");
      // staging directory cleaned up
      const { readdir } = await import("node:fs/promises");
      const siblings = await readdir(path.dirname(file));
      expect(siblings.some((f) => f.startsWith(`tmp_${path.basename(file)}`))).toBe(false);
    });

    test("abort removes staged parts and partial target", async () => {
      device = new Local(tempDir);
      const file = uniqueFile("aborted.bin");

      await device.uploadData("part1", file, "text/plain", 1, 3, {});
      expect(await device.abort(file)).toBe(true);

      const { readdir } = await import("node:fs/promises");
      const siblings = await readdir(path.dirname(file));
      expect(siblings.some((f) => f.startsWith(`tmp_${path.basename(file)}`))).toBe(false);
    });
  });

  describe("Transfer & Directories", () => {
    test("transfers a file between two local devices", async () => {
      const sourceDevice = new Local(tempDir);
      const targetDevice = new Local(tempDir);
      const source = uniqueFile("src.txt");
      const target = uniqueFile("dst.txt");

      await sourceDevice.write(source, content);
      expect(await sourceDevice.transfer(source, target, targetDevice)).toBe(true);
      expect((await targetDevice.read(target)).toString()).toBe(content);
    });

    test("transfer throws FILE_NOT_FOUND for missing source", async () => {
      const localDevice = new Local(tempDir);
      try {
        await localDevice.transfer(uniqueFile("nope"), "anywhere", localDevice);
        expect.unreachable();
      } catch (error) {
        expect((error as StorageError).code).toBe("FILE_NOT_FOUND");
      }
    });

    test("creates directories recursively", async () => {
      device = new Local(tempDir);
      const dir = path.join(tempDir, `deep-${Date.now()}`, "nested", "tree");
      expect(await device.createDirectory(dir)).toBe(true);
      expect(await isDirectory(dir)).toBe(true);
    });

    test("computes directory size", async () => {
      device = new Local(tempDir);
      const dir = path.join(tempDir, `size-${Date.now()}`);
      await device.createDirectory(dir);
      await device.write(path.join(dir, "a.txt"), "12345");
      await device.write(path.join(dir, "b.txt"), "1234567890");

      expect(await device.getDirectorySize(dir)).toBe(15);
    });

    test("lists files in a directory", async () => {
      device = new Local(tempDir);
      const dir = path.join(tempDir, `list-${Date.now()}`);
      await device.createDirectory(dir);
      await device.write(path.join(dir, "one.txt"), "1");

      const files = await device.getFiles(dir);
      expect(files.map((f) => f.key)).toContain(path.join(dir, "one.txt"));
    });

    test("deletePath removes a directory tree", async () => {
      device = new Local(tempDir);
      const dir = path.join(tempDir, `rmtree-${Date.now()}`);
      await device.createDirectory(dir);
      await device.write(path.join(dir, "child.txt"), "x");

      expect(await device.deletePath(dir)).toBe(true);
      expect(await isDirectory(dir)).toBe(false);
    });
  });
});

async function isDirectory(p: string): Promise<boolean> {
  try {
    const { stat } = await import("node:fs/promises");
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}
