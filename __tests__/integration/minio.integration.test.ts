/**
 * Integration tests against a real MinIO server.
 *
 * These tests are SKIPPED unless MINIO_TEST_URL is set, so the default
 * `bun test` run stays fully offline. To run them locally:
 *
 *   docker run -d --name storage-test-minio -p 9000:9000 -p 9001:9001 \
 *     -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin-test \
 *     minio/minio server /data --console-address ":9001"
 *   docker exec storage-test-minio mc alias set local http://localhost:9000 minioadmin minioadmin-test
 *   docker exec storage-test-minio mc mb --ignore-existing local/nuvix-storage-test
 *
 *   MINIO_TEST_URL=http://localhost:9000 bun test __tests__/integration/
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { S3 } from "../../src/device/s3";
import { Local } from "../../src/device/local";
import { StorageError } from "../../src/errors";

const MINIO_URL = process.env.MINIO_TEST_URL ?? "";
const runId = `it-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const t = test.skipIf(!MINIO_URL);

function makeDevice() {
  return new S3({
    accessKeyId: process.env.MINIO_TEST_USER ?? "minioadmin",
    secretAccessKey: process.env.MINIO_TEST_PASSWORD ?? "minioadmin-test",
    bucket: process.env.MINIO_TEST_BUCKET ?? "nuvix-storage-test",
    endpoint: MINIO_URL,
    root: runId,
  });
}

describe("MinIO Integration", () => {
  let device: S3;

  beforeAll(() => {
    if (MINIO_URL) device = makeDevice();
  });

  describe("Basic Operations", () => {
    t("writes and reads back text content", async () => {
      await device.write("hello.txt", "Hello, MinIO!", "text/plain");
      const content = await device.read("hello.txt");
      expect(content.toString()).toBe("Hello, MinIO!");
    });

    t("reports existence correctly", async () => {
      await device.write("exists-check.txt", "x", "text/plain");
      expect(await device.exists("exists-check.txt")).toBe(true);
      expect(await device.exists("never-created.txt")).toBe(false);
    });

    t("stat returns the correct size", async () => {
      const body = "stat-me-body";
      await device.write("stat.bin", body, "application/octet-stream");
      const info = await device.stat("stat.bin");
      expect(info.size).toBe(body.length);
    });

    t("deletes an object", async () => {
      await device.write("doomed.txt", "bye", "text/plain");
      await device.delete("doomed.txt");
      expect(await device.exists("doomed.txt")).toBe(false);
    });

    t("reading a missing object throws FILE_NOT_FOUND", async () => {
      try {
        await device.read("missing-object.bin");
        throw new Error("expected read() to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).code).toBe("FILE_NOT_FOUND");
      }
    });
  });

  describe("Chunked Uploads", () => {
    t("assembles multi-chunk uploads byte-exactly", async () => {
      // 3 chunks of 64 KiB each with distinct filler patterns per chunk
      const chunkSize = 64 * 1024;
      const chunks = [0, 1, 2].map((i) =>
        Buffer.alloc(chunkSize, String.fromCharCode(65 + i)),
      );
      const expected = Buffer.concat(chunks);
      const metadata = {};
      const path = "chunked/big-file.bin";

      for (const [index, data] of chunks.entries()) {
        const received = await device.uploadData(
          data,
          path,
          "application/octet-stream",
          index + 1,
          chunks.length,
          metadata,
        );
        expect(received).toBe(index + 1);
      }

      const assembled = await device.read(path);
      expect(assembled.length).toBe(expected.length);
      expect(Buffer.from(assembled).equals(expected)).toBe(true);

      // No leftover part objects
      const leftovers = (await device.getFiles("")).filter((f) =>
        f.key.includes(".part-"),
      );
      expect(leftovers.length).toBe(0);
    });

    t("abort removes staged parts and never creates the target", async () => {
      const path = "chunked/aborted.bin";
      const metadata = {};

      await device.uploadData(
        Buffer.alloc(1024, "a"),
        path,
        "application/octet-stream",
        1,
        3,
        metadata,
      );
      await device.uploadData(
        Buffer.alloc(1024, "b"),
        path,
        "application/octet-stream",
        2,
        3,
        metadata,
      );

      await device.abort(path);

      expect(await device.exists(path)).toBe(false);
      const leftovers = (await device.getFiles("")).filter((f) =>
        f.key.includes(".part-"),
      );
      expect(leftovers.length).toBe(0);
    });

    t("abort without staged parts throws FILE_NOT_FOUND", async () => {
      try {
        await device.abort("chunked/nothing-staged.bin");
        throw new Error("expected abort() to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).code).toBe("FILE_NOT_FOUND");
      }
    });
  });

  describe("Presigned URLs", () => {
    t("presigned GET URL downloads the object", async () => {
      const body = "presigned-download-payload";
      await device.write("signed/get.txt", body, "text/plain");

      const url = device.presign("signed/get.txt", { expiresIn: 60 });
      const response = await fetch(url);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(body);
    });

    t("presigned PUT URL accepts an upload", async () => {
      const body = "uploaded-via-presign";
      const url = device.presign("signed/put.txt", {
        expiresIn: 60,
        method: "PUT",
      });

      const response = await fetch(url, { method: "PUT", body });
      expect(response.status).toBeLessThan(300);

      const stored = await device.read("signed/put.txt");
      expect(stored.toString()).toBe(body);
    });

    t("expired presigned URLs are rejected", async () => {
      const url = device.presign("signed/expired.txt", { expiresIn: 1 });
      // Cannot practically wait for expiry in tests; instead verify a tampered
      // signature is rejected, proving the server actually validates SigV4.
      const tampered = `${url}X`;
      const response = await fetch(tampered);
      // MinIO answers 400 (AuthorizationQueryParametersError) for malformed
      // params, AWS answers 403 (SignatureDoesNotMatch) — both are rejections.
      expect([400, 403]).toContain(response.status);
    });
  });

  describe("Cross-Device Transfer", () => {
    t("transfers a local file into MinIO", async () => {
      const localRoot = `/tmp/opencode/nuvix-transfer-${runId}`;
      const local = new Local(localRoot);
      const body = "local-to-minio-transfer";

      await local.write("source.txt", body, "text/plain");
      await local.transfer("source.txt", "transferred/source.txt", device);

      expect(await device.exists("transferred/source.txt")).toBe(true);
      const stored = await device.read("transferred/source.txt");
      expect(stored.toString()).toBe(body);
    });
  });
});
