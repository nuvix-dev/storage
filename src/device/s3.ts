import { S3Client } from "bun";
import { Device, DeviceMetadata, FileEntry, FileStat, PresignOptions } from "../device.js";
import { StorageError } from "../errors.js";
import { Storage } from "../storage.js";

/**
 * Configuration for the S3 device (also used by Wasabi and MinIO).
 */
export interface S3Options {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Prefix under which all files are stored. */
  root?: string;
  region?: string;
  acl?: string;
  /** Custom S3-compatible endpoint (e.g. MinIO, Wasabi). Path-style URLs are used automatically. */
  endpoint?: string;
  sessionToken?: string;
  /** Multipart part size in bytes when assembling chunked uploads (min 5 MiB). Default: 5 MiB. */
  partSize?: number;
  /** Number of parts uploaded in parallel during assembly. Default: 5. */
  queueSize?: number;
  /** Retry attempts for failed part uploads. Default: 3. */
  retry?: number;
}

const PART_SUFFIX = ".part-";

const padPart = (n: number): string => String(n).padStart(5, "0");

const stripQuotes = (etag: string): string => etag.replace(/^"|"$/g, "");

const baseMimeType = (type: string): string => type.split(";")[0]?.trim() ?? "";

/**
 * S3-compatible storage device built on Bun's native `S3Client`.
 *
 * SigV4 signing, XML parsing and multipart uploads are handled by Bun itself,
 * so this class only maps the unified `Device` API onto S3 semantics.
 */
export class S3 extends Device {
  // AWS Regions
  static readonly US_EAST_1 = "us-east-1";
  static readonly US_EAST_2 = "us-east-2";
  static readonly US_WEST_1 = "us-west-1";
  static readonly US_WEST_2 = "us-west-2";
  static readonly AF_SOUTH_1 = "af-south-1";
  static readonly AP_EAST_1 = "ap-east-1";
  static readonly AP_SOUTH_1 = "ap-south-1";
  static readonly AP_NORTHEAST_1 = "ap-northeast-1";
  static readonly AP_NORTHEAST_2 = "ap-northeast-2";
  static readonly AP_NORTHEAST_3 = "ap-northeast-3";
  static readonly AP_SOUTHEAST_1 = "ap-southeast-1";
  static readonly AP_SOUTHEAST_2 = "ap-southeast-2";
  static readonly CA_CENTRAL_1 = "ca-central-1";
  static readonly EU_CENTRAL_1 = "eu-central-1";
  static readonly EU_WEST_1 = "eu-west-1";
  static readonly EU_WEST_2 = "eu-west-2";
  static readonly EU_WEST_3 = "eu-west-3";
  static readonly EU_SOUTH_1 = "eu-south-1";
  static readonly EU_NORTH_1 = "eu-north-1";
  static readonly SA_EAST_1 = "sa-east-1";
  static readonly CN_NORTH_1 = "cn-north-1";
  static readonly CN_NORTHWEST_1 = "cn-northwest-1";
  static readonly ME_SOUTH_1 = "me-south-1";
  static readonly US_GOV_EAST_1 = "us-gov-east-1";
  static readonly US_GOV_WEST_1 = "us-gov-west-1";

  // ACL Flags
  static readonly ACL_PRIVATE = "private";
  static readonly ACL_PUBLIC_READ = "public-read";
  static readonly ACL_PUBLIC_READ_WRITE = "public-read-write";
  static readonly ACL_AUTHENTICATED_READ = "authenticated-read";

  protected static readonly MAX_PAGE_SIZE = 1000;

  protected readonly client: S3Client;
  protected readonly root: string;
  private readonly writerOptions: Pick<S3Options, "partSize" | "queueSize" | "retry">;

  constructor(options: S3Options) {
    super();

    const { accessKeyId, secretAccessKey, bucket } = options;
    if (!accessKeyId || !secretAccessKey || !bucket) {
      throw new StorageError(
        "INVALID_CONFIG",
        "S3 requires `accessKeyId`, `secretAccessKey` and `bucket`",
      );
    }

    this.root = options.root ?? "";
    this.writerOptions = {
      partSize: options.partSize,
      queueSize: options.queueSize,
      retry: options.retry,
    };

    this.client = new S3Client({
      accessKeyId,
      secretAccessKey,
      bucket,
      region: options.region,
      acl: options.acl as never,
      endpoint: options.endpoint,
      sessionToken: options.sessionToken,
    });
  }

  getName(): string {
    return "S3 Storage";
  }

  getType(): string {
    return Storage.DEVICE_S3;
  }

  getDescription(): string {
    return "S3 Bucket Storage drive for AWS or on-premise solutions, powered by Bun's native S3 client";
  }

  getRoot(): string {
    return this.root;
  }

  getPath(filename: string, _prefix?: string): string {
    return this.root ? `${this.root}/${filename}` : filename;
  }

  /**
   * Map a user path to a full object key (root prefix applied).
   */
  protected key(path: string): string {
    return this.getPath(path);
  }

  async write(path: string, data: string | Buffer, contentType = ""): Promise<boolean> {
    try {
      await this.client.write(this.key(path), data, contentType ? { type: contentType } : {});
      return true;
    } catch (error) {
      throw new StorageError("WRITE_FAILED", `Failed to write ${path}: ${errorMessage(error)}`, path);
    }
  }

  async read(path: string, offset = 0, length?: number): Promise<Buffer> {
    const file = this.client.file(this.key(path));
    const sliced =
      length === undefined
        ? offset > 0
          ? file.slice(offset)
          : file
        : file.slice(offset, offset + length);

    try {
      return Buffer.from(await sliced.bytes());
    } catch (error) {
      if (isNotFound(error)) {
        throw new StorageError("FILE_NOT_FOUND", `File not found: ${path}`, path);
      }
      throw new StorageError("READ_FAILED", `Failed to read ${path}: ${errorMessage(error)}`, path);
    }
  }

  async upload(
    source: string,
    path: string,
    chunk = 1,
    chunks = 1,
    metadata: DeviceMetadata = {},
  ): Promise<number> {
    const file = Bun.file(source);
    if (!(await file.exists())) {
      throw new StorageError("FILE_NOT_FOUND", `Source file not found: ${source}`, source);
    }

    const data = Buffer.from(await file.arrayBuffer());
    const contentType =
      typeof metadata.contentType === "string" && metadata.contentType.length > 0
        ? metadata.contentType
        : baseMimeType(file.type) || "application/octet-stream";

    return this.uploadData(data, path, contentType, chunk, chunks, metadata);
  }

  async uploadData(
    data: string | Buffer,
    path: string,
    contentType: string,
    chunk = 1,
    chunks = 1,
    metadata: DeviceMetadata = {},
  ): Promise<number> {
    if (chunks <= 1) {
      await this.write(path, data, contentType);
      return 1;
    }

    const key = this.key(path);

    // Stage each chunk as its own object, then assemble with a streaming
    // multipart upload once every chunk has arrived.
    const partKey = `${key}${PART_SUFFIX}${padPart(chunk)}`;
    await this.client.write(partKey, data, { type: contentType });

    const received = Number(metadata.receivedChunks ?? 0) + 1;
    metadata.receivedChunks = received;

    if (received < chunks) {
      return received;
    }

    try {
      const writer = this.client.file(key, { type: contentType }).writer({ ...this.writerOptions });
      for (let i = 1; i <= chunks; i++) {
        writer.write(await this.client.file(`${key}${PART_SUFFIX}${padPart(i)}`).bytes());
      }
      await writer.end();
    } catch (error) {
      throw new StorageError("UPLOAD_FAILED", `Failed to assemble chunks for ${path}: ${errorMessage(error)}`, path);
    } finally {
      await this.deleteStagedParts(key, chunks);
    }

    return received;
  }

  /**
   * Abort a chunked upload: remove any staged part objects.
   */
  async abort(path: string, _extra = ""): Promise<boolean> {
    await this.deleteStagedPartsByPrefix(`${this.key(path)}${PART_SUFFIX}`);
    return true;
  }

  async delete(path: string, _recursive = false): Promise<boolean> {
    try {
      await this.client.delete(this.key(path));
      return true;
    } catch (error) {
      throw new StorageError("DELETE_FAILED", `Failed to delete ${path}: ${errorMessage(error)}`, path);
    }
  }

  async deletePath(path: string): Promise<boolean> {
    const prefix = `${this.key(path)}/`;
    let continuationToken: string | undefined;

    do {
      const page = await this.client.list({
        prefix,
        maxKeys: S3.MAX_PAGE_SIZE,
        continuationToken,
      });

      const keys = (page.contents ?? []).map((object) => object.key);
      await Promise.all(keys.map((k) => this.client.delete(k)));

      continuationToken = page.isTruncated ? page.nextContinuationToken : undefined;
    } while (continuationToken);

    return true;
  }

  async exists(path: string): Promise<boolean> {
    return this.client.exists(this.key(path));
  }

  async stat(path: string): Promise<FileStat> {
    try {
      const s = await this.client.stat(this.key(path));
      return {
        size: s.size,
        mimeType: baseMimeType(s.type),
        etag: s.etag ? stripQuotes(s.etag) : undefined,
        lastModified: s.lastModified,
      };
    } catch (error) {
      if (isNotFound(error)) {
        throw new StorageError("FILE_NOT_FOUND", `File not found: ${path}`, path);
      }
      throw error;
    }
  }

  async getFileSize(path: string): Promise<number> {
    return (await this.stat(path)).size;
  }

  async getFileMimeType(path: string): Promise<string> {
    return (await this.stat(path)).mimeType;
  }

  async getFileHash(path: string): Promise<string> {
    // For non-multipart objects the ETag is the object's MD5 hash.
    return (await this.stat(path)).etag ?? "";
  }

  presign(path: string, options: PresignOptions = {}): string {
    return this.client.presign(this.key(path), options as never);
  }

  async createDirectory(_path: string): Promise<boolean> {
    return true; // Object storage has no real directories.
  }

  async getDirectorySize(path: string): Promise<number> {
    let size = 0;
    let continuationToken: string | undefined;

    do {
      const page = await this.client.list({
        prefix: `${this.key(path)}/`,
        maxKeys: S3.MAX_PAGE_SIZE,
        continuationToken,
      });

      for (const object of page.contents ?? []) {
        size += object.size ?? 0;
      }

      continuationToken = page.isTruncated ? page.nextContinuationToken : undefined;
    } while (continuationToken);

    return size;
  }

  async getPartitionFreeSpace(): Promise<number> {
    return -1;
  }

  async getPartitionTotalSpace(): Promise<number> {
    return -1;
  }

  async getFiles(dir: string, max = S3.MAX_PAGE_SIZE, continuationToken = ""): Promise<FileEntry[]> {
    const page = await this.client.list({
      prefix: dir ? `${this.key(dir)}/` : `${this.root}/`,
      maxKeys: Math.min(max, S3.MAX_PAGE_SIZE),
      continuationToken: continuationToken || undefined,
    });

    return (page.contents ?? []).map((object) => ({
      key: object.key,
      size: object.size,
      lastModified: object.lastModified ? new Date(object.lastModified) : undefined,
      etag: object.eTag ? stripQuotes(object.eTag) : undefined,
    }));
  }

  /**
   * Remove staged part objects after assembly or failure.
   */
  private async deleteStagedParts(key: string, chunks: number): Promise<void> {
    await Promise.all(
      Array.from({ length: chunks }, (_, i) =>
        this.client.delete(`${key}${PART_SUFFIX}${padPart(i + 1)}`).catch(() => undefined),
      ),
    );
  }

  /**
   * List and delete all staged parts matching a prefix (used by `abort`).
   */
  private async deleteStagedPartsByPrefix(prefix: string): Promise<void> {
    const page = await this.client.list({ prefix, maxKeys: S3.MAX_PAGE_SIZE });
    await Promise.all(
      (page.contents ?? []).map((object) =>
        this.client.delete(object.key).catch(() => undefined),
      ),
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNotFound(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return message.includes("404") || message.includes("nosuchkey");
}
