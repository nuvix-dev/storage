import { S3, S3Options } from "./s3.js";
import { Storage } from "../storage.js";

/**
 * Wasabi-specific options. The endpoint is derived from the region.
 */
export type WasabiOptions = Omit<S3Options, "endpoint">;

/**
 * Wasabi hot cloud storage — an S3-compatible device that only overrides
 * the endpoint (`https://s3.{region}.wasabisys.com`).
 */
export class Wasabi extends S3 {
  // Wasabi Regions
  static readonly US_WEST_1 = "us-west-1";
  static readonly US_CENTRAL_1 = "us-central-1";
  static readonly US_EAST_1 = "us-east-1";
  static readonly US_EAST_2 = "us-east-2";
  static readonly AP_NORTHEAST_1 = "ap-northeast-1";
  static readonly AP_NORTHEAST_2 = "ap-northeast-2";
  static readonly EU_CENTRAL_1 = "eu-central-1";
  static readonly EU_CENTRAL_2 = "eu-central-2";
  static readonly EU_WEST_1 = "eu-west-1";
  static readonly EU_WEST_2 = "eu-west-2";

  constructor(options: WasabiOptions) {
    const region = options.region ?? Wasabi.EU_CENTRAL_1;
    super({ ...options, region, endpoint: `https://s3.${region}.wasabisys.com` });
  }

  getName(): string {
    return "Wasabi Storage";
  }

  getDescription(): string {
    return "Wasabi hot cloud storage drive, powered by Bun's native S3 client";
  }

  getType(): string {
    return Storage.DEVICE_WASABI;
  }
}
