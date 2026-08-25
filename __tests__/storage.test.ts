import { describe, test, expect, beforeEach } from "bun:test";
import { Storage } from "../src/storage";
import { Local } from "../src/device/local";

describe("Storage", () => {
  beforeEach(() => {
    Storage.removeDevice("local-test");
    Storage.removeDevice("wasabi-test");
    Storage.removeDevice("test");
  });

  describe("Constants", () => {
    test("should have correct device constants", () => {
      expect(Storage.DEVICE_LOCAL).toBe("local");
      expect(Storage.DEVICE_S3).toBe("s3");
      expect(Storage.DEVICE_WASABI).toBe("wasabi");
      expect(Storage.DEVICE_MINIO).toBe("minio");
    });
  });

  describe("setDevice / getDevice", () => {
    test("should register and retrieve a device", () => {
      const device = new Local();
      Storage.setDevice("local-test", device);

      expect(Storage.exists("local-test")).toBe(true);
      expect(Storage.getDevice("local-test")).toBe(device);
    });

    test("should overwrite an existing registration", () => {
      const first = new Local("./a");
      const second = new Local("./b");

      Storage.setDevice("test", first);
      Storage.setDevice("test", second);

      expect(Storage.getDevice("test")).toBe(second);
    });

    test("should throw StorageError for unknown device", () => {
      expect(() => Storage.getDevice("nonexistent")).toThrow(
        'The device "nonexistent" is not listed',
      );
      try {
        Storage.getDevice("nonexistent");
      } catch (error) {
        expect((error as Error).name).toBe("StorageError");
      }
    });
  });

  describe("exists", () => {
    test("returns true/false based on registration", () => {
      expect(Storage.exists("nope")).toBe(false);
      Storage.setDevice("nope", new Local());
      expect(Storage.exists("nope")).toBe(true);
    });
  });

  describe("removeDevice / listDevices", () => {
    test("removes a registered device", () => {
      Storage.setDevice("test", new Local());
      expect(Storage.removeDevice("test")).toBe(true);
      expect(Storage.exists("test")).toBe(false);
    });

    test("lists all registered device names", () => {
      Storage.setDevice("a", new Local());
      Storage.setDevice("b", new Local());
      expect(Storage.listDevices()).toContain("a");
      expect(Storage.listDevices()).toContain("b");
    });
  });

  describe("human", () => {
    test("formats metric sizes", () => {
      expect(Storage.human(0)).toBe("0.00B");
      expect(Storage.human(1000)).toBe("1.00kB");
      expect(Storage.human(1_000_000)).toBe("1.00MB");
      expect(Storage.human(1_000_000_000)).toBe("1.00GB");
      expect(Storage.human(1_000_000_000_000)).toBe("1.00TB");
    });

    test("formats binary sizes", () => {
      expect(Storage.human(1024, 2, "binary")).toBe("1.00KiB");
      expect(Storage.human(1048576, 2, "binary")).toBe("1.00MiB");
      expect(Storage.human(1073741824, 2, "binary")).toBe("1.00GiB");
    });

    test("supports custom decimals", () => {
      expect(Storage.human(1536, 1)).toBe("1.5kB");
    });
  });
});
