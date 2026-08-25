import { StorageError } from "./errors.js";

/**
 * Arbitrary key/value metadata carried across chunked upload calls.
 */
export type DeviceMetadata = Record<string, unknown>;

/**
 * Stat information for a stored file.
 */
export interface FileStat {
  size: number;
  mimeType: string;
  etag?: string;
  lastModified?: Date;
}

/**
 * A single entry returned by `getFiles`.
 */
export interface FileEntry {
  key: string;
  size?: number;
  lastModified?: Date;
  etag?: string;
}

/**
 * Options accepted by `presign` where supported.
 */
export interface PresignOptions {
  expiresIn?: number;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "HEAD";
  acl?: string;
  type?: string;
}

/**
 * Abstract storage device.
 *
 * Every backend (local disk, S3, Wasabi, MinIO, ...) implements this contract,
 * so callers can swap devices without changing application code.
 */
export abstract class Device {
  /**
   * Max chunk size while transferring a file from one device to another.
   */
  protected transferChunkSize = 20_000_000; // 20 MB

  /**
   * Set the maximum chunk size used by `transfer`.
   */
  public setTransferChunkSize(chunkSize: number): void {
    this.transferChunkSize = chunkSize;
  }

  public getTransferChunkSize(): number {
    return this.transferChunkSize;
  }

  /** Storage device name. */
  abstract getName(): string;

  /** Storage device type (one of `Storage.DEVICE_*`). */
  abstract getType(): string;

  /** Human-readable description of the device. */
  abstract getDescription(): string;

  /** Root path/prefix under which all files are stored. */
  abstract getRoot(): string;

  /** Build the full internal path for a filename. */
  abstract getPath(filename: string, prefix?: string): string;

  /**
   * Upload a local file to the given path.
   * Returns the number of chunks written, or 0 on failure.
   */
  abstract upload(
    source: string,
    path: string,
    chunk?: number,
    chunks?: number,
    metadata?: DeviceMetadata,
  ): Promise<number>;

  /**
   * Upload raw data to the given path.
   * Returns the number of chunks written, or 0 on failure.
   */
  abstract uploadData(
    data: string | Buffer,
    path: string,
    contentType: string,
    chunk?: number,
    chunks?: number,
    metadata?: DeviceMetadata,
  ): Promise<number>;

  /** Abort an in-progress chunked upload and clean staged parts. */
  abstract abort(path: string, extra?: string): Promise<boolean>;

  /** Read a file (optionally a byte range) into memory. */
  abstract read(path: string, offset?: number, length?: number): Promise<Buffer>;

  /** Write data to a path. Throws `StorageError` on failure. */
  abstract write(
    path: string,
    data: string | Buffer,
    contentType?: string,
  ): Promise<boolean>;

  /**
   * Transfer a file from this device to another device.
   * Files larger than `transferChunkSize` are streamed in chunks.
   */
  public async transfer(
    filePath: string,
    destination: string,
    device: Device,
  ): Promise<boolean> {
    if (!(await this.exists(filePath))) {
      throw new StorageError("FILE_NOT_FOUND", `File not found: ${filePath}`, filePath);
    }

    const size = await this.getFileSize(filePath);
    const contentType = await this.getFileMimeType(filePath);

    if (size <= this.transferChunkSize) {
      return device.write(destination, await this.read(filePath), contentType);
    }

    const totalChunks = Math.ceil(size / this.transferChunkSize);
    const metadata: DeviceMetadata = {};

    for (let counter = 0; counter < totalChunks; counter++) {
      const data = await this.read(
        filePath,
        counter * this.transferChunkSize,
        this.transferChunkSize,
      );
      await device.uploadData(
        data,
        destination,
        contentType,
        counter + 1,
        totalChunks,
        metadata,
      );
    }

    return true;
  }

  /**
   * Move a file within this device: transfer then delete the source.
   */
  public async move(source: string, target: string): Promise<boolean> {
    if (source === target) {
      return false;
    }
    if (!(await this.exists(source))) {
      return false;
    }
    if (await this.transfer(source, target, this)) {
      return this.delete(source);
    }
    return false;
  }

  /** Delete a file (or directory when `recursive`). */
  abstract delete(path: string, recursive?: boolean): Promise<boolean>;

  /** Delete everything under a directory path. */
  abstract deletePath(path: string): Promise<boolean>;

  /** Check whether a file exists. */
  abstract exists(path: string): Promise<boolean>;

  /** Get file size in bytes. */
  abstract getFileSize(path: string): Promise<number>;

  /** Get file MIME type. */
  abstract getFileMimeType(path: string): Promise<string>;

  /** Get file MD5 hash as hex string. */
  abstract getFileHash(path: string): Promise<string>;

  /** Get size, MIME type and (when available) ETag in one call. */
  abstract stat(path: string): Promise<FileStat>;

  /**
   * Generate a presigned URL for temporary access.
   * Only supported by cloud devices; throws `UNSUPPORTED_OPERATION` otherwise.
   */
  public presign(_path: string, _options?: PresignOptions): string {
    throw new StorageError(
      "UNSUPPORTED_OPERATION",
      `${this.getName()} does not support presigned URLs`,
    );
  }

  /** Create a directory (recursive). Returns true on success or if it exists. */
  abstract createDirectory(path: string): Promise<boolean>;

  /** Total size in bytes of all files under a directory. -1 on error. */
  abstract getDirectorySize(path: string): Promise<number>;

  /** Free space on the backing partition. -1 when not applicable. */
  abstract getPartitionFreeSpace(): Promise<number>;

  /** Total space on the backing partition. -1 when not applicable. */
  abstract getPartitionTotalSpace(): Promise<number>;

  /** List files under a directory, paginated where the backend supports it. */
  abstract getFiles(dir: string, max?: number, continuationToken?: string): Promise<FileEntry[]>;

  /**
   * Resolve `../`, `.`, duplicate and mixed separators to a canonical
   * absolute-looking path. Works on paths that do not exist yet.
   */
  public getAbsolutePath(path: string): string {
    const normalizedPath = path.replace(/[/\\]/g, "/");
    const parts = normalizedPath.split("/").filter((part) => part.length > 0);

    const absolutes: string[] = [];
    for (const part of parts) {
      if (part === ".") continue;
      if (part === "..") {
        absolutes.pop();
      } else {
        absolutes.push(part);
      }
    }

    return "/" + absolutes.join("/");
  }
}
