import { describe, test, expect } from "bun:test";
import { MinIO } from "../../src/device/minio";
import { S3 } from "../../src/device/s3";
import { Storage } from "../../src/storage";

const baseOptions = {
  accessKeyId: "minioadmin",
  secretAccessKey: "minioadmin",
  bucket: "test-bucket",
};

describe("MinIO Device", () => {
  test("reports MinIO metadata", () => {
    const device = new MinIO(baseOptions);
    expect(device.getName()).toBe("MinIO Storage");
    expect(device.getType()).toBe(Storage.DEVICE_MINIO);
    expect(device.getDescription()).toContain("MinIO");
  });

  test("uses path-style URLs against the local endpoint over HTTP by default", () => {
    const device = new MinIO(baseOptions);
    const url = device.presign("file.txt");

    expect(url.startsWith("http://localhost:9000/test-bucket/")).toBe(true);
    expect(url).toContain("X-Amz-Signature=");
  });

  test("supports useSSL", () => {
    const device = new MinIO({ ...baseOptions, endpoint: "play.min.io", useSSL: true });
    const url = device.presign("file.txt");

    expect(url.startsWith("https://play.min.io/test-bucket/")).toBe(true);
  });

  test("strips protocol prefixes from the endpoint", () => {
    const device = new MinIO({ ...baseOptions, endpoint: "https://play.min.io", useSSL: true });
    const url = device.presign("file.txt");

    expect(url.startsWith("https://play.min.io/test-bucket/")).toBe(true);
  });

  test("defaults to us-east-1 region (SigV4 requirement)", () => {
    const device = new MinIO(baseOptions);
    const url = device.presign("file.txt");

    expect(url).toContain("X-Amz-Credential=minioadmin%2F");
    expect(url).toContain("us-east-1");
  });

  test("inherits S3 ACL constants", () => {
    expect(MinIO.ACL_PUBLIC_READ).toBe(S3.ACL_PUBLIC_READ);
  });
});
