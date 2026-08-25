import { describe, test, expect } from "bun:test";
import { S3 } from "../../src/device/s3";
import { Storage } from "../../src/storage";
import { StorageError } from "../../src/errors";

const credentials = {
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
  bucket: "test-bucket",
};

describe("S3 Device", () => {
  describe("Configuration", () => {
    test("constructs with options object", () => {
      const device = new S3({ ...credentials, root: "test-storage" });
      expect(device.getRoot()).toBe("test-storage");
      expect(device.getName()).toBe("S3 Storage");
      expect(device.getType()).toBe(Storage.DEVICE_S3);
    });

    test("defaults root to empty string", () => {
      const device = new S3(credentials);
      expect(device.getRoot()).toBe("");
      expect(device.getPath("file.txt")).toBe("file.txt");
    });

    test("prepends root in getPath", () => {
      const device = new S3({ ...credentials, root: "app-uploads" });
      expect(device.getPath("docs/file.txt")).toBe("app-uploads/docs/file.txt");
    });

    test("throws INVALID_CONFIG without credentials", () => {
      const make = (options: unknown) => new S3(options as never);

      for (const missing of [
        { secretAccessKey: "s", bucket: "b" },
        { accessKeyId: "a", bucket: "b" },
        { accessKeyId: "a", secretAccessKey: "s" },
      ]) {
        expect(() => make(missing)).toThrow(StorageError);
      }
    });
  });

  describe("Region Constants", () => {
    test("exposes AWS regions", () => {
      expect(S3.US_EAST_1).toBe("us-east-1");
      expect(S3.EU_WEST_1).toBe("eu-west-1");
      expect(S3.EU_CENTRAL_1).toBe("eu-central-1");
      expect(S3.AP_SOUTHEAST_1).toBe("ap-southeast-1");
      expect(S3.CN_NORTHWEST_1).toBe("cn-northwest-1");
      expect(S3.US_GOV_WEST_1).toBe("us-gov-west-1");
    });

    test("SA_EAST_1 maps to the correct region (regression fix)", () => {
      expect(S3.SA_EAST_1).toBe("sa-east-1");
    });
  });

  describe("ACL Constants", () => {
    test("exposes ACL flags", () => {
      expect(S3.ACL_PRIVATE).toBe("private");
      expect(S3.ACL_PUBLIC_READ).toBe("public-read");
      expect(S3.ACL_PUBLIC_READ_WRITE).toBe("public-read-write");
      expect(S3.ACL_AUTHENTICATED_READ).toBe("authenticated-read");
    });
  });

  describe("presign (offline)", () => {
    test("generates a path-style URL for default AWS", () => {
      const device = new S3({
        ...credentials,
        region: S3.US_EAST_1,
      });

      const url = device.presign("hello.txt", { expiresIn: 60 });
      expect(url).toContain("https://s3.us-east-1.amazonaws.com/test-bucket/hello.txt");
      expect(url).toContain("X-Amz-Signature=");
    });

    test("includes root prefix in presigned key", () => {
      const device = new S3({ ...credentials, root: "prefix" });
      const url = device.presign("nested/file.txt");
      expect(url).toContain("prefix/nested/file.txt");
    });

    test("honours custom endpoints", () => {
      const device = new S3({
        ...credentials,
        endpoint: "https://s3.us-east-1.amazonaws.com",
      });
      const url = device.presign("file.bin");
      expect(url).toContain("https://s3.us-east-1.amazonaws.com/test-bucket/");
    });
  });

  describe("Inherited behaviour", () => {
    test("transfer chunk size is configurable", () => {
      const device = new S3(credentials);
      device.setTransferChunkSize(5_000_000);
      expect(device.getTransferChunkSize()).toBe(5_000_000);
    });

    test("createDirectory is a no-op returning true", async () => {
      const device = new S3(credentials);
      expect(await device.createDirectory("any/path")).toBe(true);
    });

    test("partition space queries report -1", async () => {
      const device = new S3(credentials);
      expect(await device.getPartitionFreeSpace()).toBe(-1);
      expect(await device.getPartitionTotalSpace()).toBe(-1);
    });
  });
});
