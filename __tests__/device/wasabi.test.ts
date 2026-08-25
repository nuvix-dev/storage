import { describe, test, expect } from "bun:test";
import { Wasabi } from "../../src/device/wasabi";
import { S3 } from "../../src/device/s3";
import { Storage } from "../../src/storage";

const baseOptions = {
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
  bucket: "test-bucket",
};

describe("Wasabi Device", () => {
  test("reports Wasabi metadata", () => {
    const device = new Wasabi(baseOptions);
    expect(device.getName()).toBe("Wasabi Storage");
    expect(device.getType()).toBe(Storage.DEVICE_WASABI);
    expect(device.getDescription()).toContain("Wasabi");
  });

  test("exposes Wasabi regions", () => {
    expect(Wasabi.US_EAST_1).toBe("us-east-1");
    expect(Wasabi.US_CENTRAL_1).toBe("us-central-1");
    expect(Wasabi.EU_CENTRAL_1).toBe("eu-central-1");
    expect(Wasabi.EU_CENTRAL_2).toBe("eu-central-2");
    expect(Wasabi.AP_NORTHEAST_1).toBe("ap-northeast-1");
  });

  test("derives the wasabisys.com endpoint from the region", () => {
    const device = new Wasabi({ ...baseOptions, region: Wasabi.US_CENTRAL_1 });
    const url = device.presign("file.txt");

    expect(url).toContain("https://s3.us-central-1.wasabisys.com/test-bucket/");
  });

  test("defaults to EU_CENTRAL_1", () => {
    const device = new Wasabi(baseOptions);
    const url = device.presign("file.txt");

    expect(url).toContain("s3.eu-central-1.wasabisys.com/test-bucket/");
  });

  test("inherits S3 ACL constants and chunk size behaviour", () => {
    const device = new Wasabi(baseOptions);
    expect(Wasabi.ACL_PRIVATE).toBe(S3.ACL_PRIVATE);
    device.setTransferChunkSize(1000);
    expect(device.getTransferChunkSize()).toBe(1000);
  });
});
