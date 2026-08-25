import { mkdir, readdir, rm, statfs } from "node:fs/promises";
import path from "node:path";
import { Device, DeviceMetadata, FileEntry, FileStat } from "../device.js";
import { StorageError } from "../errors.js";
import { Storage } from "../storage.js";

const PART_MARKER = ".part.";

/**
 * Local filesystem storage device built on Bun's native file APIs
 * (`Bun.file`, `Bun.write`). Directory operations use Bun's built-in
 * Node-compatible `node:fs` module.
 */
export class Local extends Device {
  protected root: string;

  constructor(root = "") {
    super();
    this.root = root;
  }

  getName(): string {
    return "Local Storage";
  }

  getType(): string {
    return Storage.DEVICE_LOCAL;
  }

  getDescription(): string {
    return "Adapter for local storage on the physical or virtual machine, or mounted to it.";
  }

  getRoot(): string {
    return this.root;
  }

  getPath(filename: string, _prefix?: string): string {
    return this.getAbsolutePath(path.join(this.root, filename));
  }

  async upload(
    source: string,
    filePath: string,
    chunk = 1,
    chunks = 1,
    _metadata: DeviceMetadata = {},
  ): Promise<number> {
    if (chunks <= 1) {
      await this.createDirectory(path.dirname(filePath));
      try {
        await this.rename(source, filePath);
        return 1;
      } catch {
        throw new StorageError("UPLOAD_FAILED", `Can't upload file ${filePath}`, filePath);
      }
    }

    const stagingDir = stagingDirFor(filePath);
    await this.createDirectory(stagingDir);

    const partPath = partPathFor(filePath, chunk);
    try {
      await this.rename(source, partPath);
    } catch {
      throw new StorageError("UPLOAD_FAILED", `Failed to write chunk ${chunk}`, filePath);
    }

    const received = (await this.listParts(filePath)).length;

    if (received === chunks) {
      await this.joinChunks(filePath, chunks);
    }

    return received;
  }

  async uploadData(
    data: string | Buffer,
    filePath: string,
    _contentType: string,
    chunk = 1,
    chunks = 1,
    _metadata: DeviceMetadata = {},
  ): Promise<number> {
    if (chunks <= 1) {
      return (await this.write(filePath, data)) ? 1 : 0;
    }

    const stagingDir = stagingDirFor(filePath);
    await this.createDirectory(stagingDir);

    try {
      await Bun.write(partPathFor(filePath, chunk), data);
    } catch {
      throw new StorageError("UPLOAD_FAILED", `Failed to write chunk ${chunk}`, filePath);
    }

    const received = (await this.listParts(filePath)).length;

    if (received === chunks) {
      await this.joinChunks(filePath, chunks);
    }

    return received;
  }

  /**
   * Abort a chunked upload: remove staged parts and any partial target.
   */
  async abort(filePath: string, _extra = ""): Promise<boolean> {
    const stagingDir = stagingDirFor(filePath);

    if (await Bun.file(filePath).exists()) {
      await Bun.file(filePath).delete();
    }

    if (!(await isDirectory(stagingDir))) {
      throw new StorageError("FILE_NOT_FOUND", `No staged upload for ${filePath}`, filePath);
    }

    await rm(stagingDir, { recursive: true, force: true });
    return true;
  }

  async read(filePath: string, offset = 0, length?: number): Promise<Buffer> {
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      throw new StorageError("FILE_NOT_FOUND", `File not found: ${filePath}`, filePath);
    }

    const sliced =
      length === undefined ? (offset > 0 ? file.slice(offset) : file) : file.slice(offset, offset + length);

    return Buffer.from(await sliced.arrayBuffer());
  }

  async write(filePath: string, data: string | Buffer, _contentType = ""): Promise<boolean> {
    try {
      await this.createDirectory(path.dirname(filePath));
      await Bun.write(Bun.file(filePath), data);
      return true;
    } catch {
      throw new StorageError("WRITE_FAILED", `Can't write to path ${filePath}`, filePath);
    }
  }

  /**
   * Move a file within the local device using an atomic rename.
   */
  async move(source: string, target: string): Promise<boolean> {
    if (source === target || !(await exists(source))) {
      return false;
    }
    try {
      await this.createDirectory(path.dirname(target));
      await this.rename(source, target);
      return true;
    } catch {
      return false;
    }
  }

  async delete(filePath: string, recursive = false): Promise<boolean> {
    try {
      const file = Bun.file(filePath);
      if (await file.exists()) {
        await file.delete();
        return true;
      }
      // Not a regular file — maybe a directory.
      if (recursive && (await isDirectory(filePath))) {
        await rm(filePath, { recursive: true });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async deletePath(filePath: string): Promise<boolean> {
    if (!(await isDirectory(filePath))) {
      return false;
    }
    await rm(filePath, { recursive: true, force: true });
    return true;
  }

  async exists(filePath: string): Promise<boolean> {
    return Bun.file(filePath).exists();
  }

  async getFileSize(filePath: string): Promise<number> {
    const size = Bun.file(filePath).size;
    if (size === -1 && !(await Bun.file(filePath).exists())) {
      throw new StorageError("FILE_NOT_FOUND", `File not found: ${filePath}`, filePath);
    }
    return size;
  }

  async getFileMimeType(filePath: string): Promise<string> {
    // Bun detects MIME from content magic bytes + extension.
    return stripCharset(Bun.file(filePath).type);
  }

  async getFileHash(filePath: string): Promise<string> {
    const hasher = new Bun.CryptoHasher("md5");
    hasher.update(await Bun.file(filePath).bytes());
    return hasher.digest("hex");
  }

  async stat(filePath: string): Promise<FileStat> {
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      throw new StorageError("FILE_NOT_FOUND", `File not found: ${filePath}`, filePath);
    }
    return {
      size: file.size,
      mimeType: stripCharset(file.type),
    };
  }

  async createDirectory(dirPath: string): Promise<boolean> {
    try {
      await mkdir(dirPath, { recursive: true, mode: 0o755 });
      return true;
    } catch {
      return false;
    }
  }

  async getDirectorySize(dirPath: string): Promise<number> {
    let total = 0;
    let entries: FileEntry[];

    try {
      entries = await this.getFiles(dirPath);
    } catch {
      return -1;
    }

    for (const entry of entries) {
      if (await isDirectory(entry.key)) {
        total += await this.getDirectorySize(entry.key);
      } else {
        total += Bun.file(entry.key).size;
      }
    }

    return total;
  }

  async getPartitionFreeSpace(): Promise<number> {
    const stats = await statfs(this.root || ".");
    return stats.bavail * stats.bsize;
  }

  async getPartitionTotalSpace(): Promise<number> {
    const stats = await statfs(this.root || ".");
    return stats.blocks * stats.bsize;
  }

  async getFiles(dir: string): Promise<FileEntry[]> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      return entries.map((entry) => ({
        key: path.join(dir, entry.name),
        size: entry.isFile() ? Bun.file(path.join(dir, entry.name)).size : undefined,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Concatenate staged parts into the final file and clean up.
   */
  private async joinChunks(filePath: string, chunks: number): Promise<void> {
    const target = Bun.file(filePath);
    const writer = target.writer();

    for (let i = 1; i <= chunks; i++) {
      const partPath = partPathFor(filePath, i);
      writer.write(await Bun.file(partPath).bytes());
    }
    await writer.end();

    await rm(stagingDirFor(filePath), { recursive: true, force: true });
  }

  /**
   * Count staged part files for a target path.
   */
  private async listParts(filePath: string): Promise<string[]> {
    const stagingDir = stagingDirFor(filePath);
    const prefix = `${path.parse(filePath).name}${PART_MARKER}`;

    try {
      const entries = await readdir(stagingDir);
      return entries.filter((entry) => entry.startsWith(prefix));
    } catch {
      return [];
    }
  }

  private async rename(source: string, target: string): Promise<void> {
    await import("node:fs").then((fs) => fs.promises.rename(source, target));
  }
}

function stagingDirFor(filePath: string): string {
  return path.join(path.dirname(filePath), `tmp_${path.basename(filePath)}`);
}

function partPathFor(filePath: string, chunk: number): string {
  return path.join(
    stagingDirFor(filePath),
    `${path.parse(filePath).name}${PART_MARKER}${chunk}`,
  );
}

async function exists(p: string): Promise<boolean> {
  return Bun.file(p).exists();
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    const { stat } = await import("node:fs/promises");
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

function stripCharset(type: string): string {
  return type.split(";")[0]?.trim() ?? "";
}
