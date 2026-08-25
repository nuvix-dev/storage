import { S3, S3Options } from "./s3.js";
import { Storage } from "../storage.js";

/**
 * MinIO-specific options.
 */
export interface MinIOOptions extends Omit<S3Options, "endpoint"> {
  /** MinIO server host, e.g. `localhost:9000`. Protocol prefixes are stripped. */
  endpoint?: string;
  /** Use HTTPS instead of HTTP. Default: false. */
  useSSL?: boolean;
}

/**
 * MinIO object storage — an S3-compatible device pointing at a self-hosted
 * MinIO server. Bun's S3Client uses path-style URLs for custom endpoints,
 * which is exactly what MinIO expects.
 */
export class MinIO extends S3 {
  constructor(options: MinIOOptions) {
    const { endpoint = "localhost:9000", useSSL = false, ...rest } = options;
    const cleanEndpoint = endpoint.replace(/^https?:\/\//, "");

    super({
      ...rest,
      region: rest.region ?? S3.US_EAST_1,
      endpoint: `${useSSL ? "https" : "http"}://${cleanEndpoint}`,
    });
  }

  getName(): string {
    return "MinIO Storage";
  }

  getDescription(): string {
    return "MinIO S3-compatible object storage server, powered by Bun's native S3 client";
  }

  getType(): string {
    return Storage.DEVICE_MINIO;
  }
}
