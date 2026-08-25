import { Device } from "./device.js";
import { StorageError } from "./errors.js";

/**
 * Central device registry.
 *
 * Register devices by name once at startup, then resolve them anywhere
 * in the application via `Storage.getDevice`.
 */
export class Storage {
  static readonly DEVICE_LOCAL = "local";
  static readonly DEVICE_S3 = "s3";
  static readonly DEVICE_WASABI = "wasabi";
  static readonly DEVICE_MINIO = "minio";

  private static devices: Map<string, Device> = new Map();

  /**
   * Register a device under a name (replaces any existing registration).
   */
  static setDevice(name: string, device: Device): void {
    this.devices.set(name, device);
  }

  /**
   * Get a registered device by name.
   * @throws StorageError with code `DEVICE_NOT_FOUND` when missing.
   */
  static getDevice(name: string): Device {
    const device = this.devices.get(name);
    if (!device) {
      throw new StorageError("DEVICE_NOT_FOUND", `The device "${name}" is not listed`, name);
    }
    return device;
  }

  /**
   * Check whether a device name is registered.
   */
  static exists(name: string): boolean {
    return this.devices.has(name);
  }

  /**
   * Unregister a device. Returns true if it was registered.
   */
  static removeDevice(name: string): boolean {
    return this.devices.delete(name);
  }

  /**
   * Names of all registered devices.
   */
  static listDevices(): string[] {
    return [...this.devices.keys()];
  }

  /**
   * Format bytes as a human-readable size string.
   *
   * @example
   * Storage.human(1024);              // "1.00kB"  (metric)
   * Storage.human(1024, 2, "binary"); // "1.00KiB"
   */
  static human(
    bytes: number,
    decimals = 2,
    system: "binary" | "metric" = "metric",
  ): string {
    const mod = system === "binary" ? 1024 : 1000;

    const units = {
      binary: ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"],
      metric: ["B", "kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"],
    };

    const factor = Math.floor((bytes.toString().length - 1) / 3);

    return `${(bytes / Math.pow(mod, factor)).toFixed(decimals)}${units[system][factor]}`;
  }
}
