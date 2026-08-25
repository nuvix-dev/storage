# @nuvix/storage

A TypeScript-first storage library for the Nuvix BaaS platform, built entirely on [Bun](https://bun.sh)'s native APIs (`Bun.file`, `Bun.S3Client`). Provides a unified API across local filesystem, AWS S3, Wasabi, and MinIO — with zero runtime dependencies.

## Requirements

- **[Bun](https://bun.sh) >= 1.2.0** (required at runtime — this library is Bun-only)

## Features

- 🚀 **Zero dependencies** — signing, multipart uploads, and XML parsing are handled natively by `Bun.S3Client`
- 🔌 **Multiple backends** — Local filesystem, AWS S3, Wasabi, and MinIO behind one interface
- ✍️ **Options-object constructors** — explicit, typed configuration for every device
- 🔏 **Presigned URLs** — generate time-limited upload/download URLs offline (no network call)
- 📊 **File stats** — size + MIME type in a single `stat()` call
- 🔄 **Chunked uploads** — large files assembled from ordered chunks, with abort support
- 🛡️ **Typed errors** — every failure throws a `StorageError` with a machine-readable `code`
- ✅ **Validators** — file extension, name, size, content type (magic bytes), and upload checks

## Installation

```bash
bun add @nuvix/storage
```

## Quick Start

```typescript
import { Storage, Local } from "@nuvix/storage";

const localStorage = new Local({ root: "./uploads" });
Storage.setDevice(Storage.DEVICE_LOCAL, localStorage);

const device = Storage.getDevice(Storage.DEVICE_LOCAL);
await device.write("hello.txt", "Hello, World!", "text/plain");

console.log(await device.read("hello.txt")); // Buffer("Hello, World!")
```

## Storage Devices

### Local Filesystem

```typescript
import { Local } from "@nuvix/storage";

// Root defaults to the current working directory
const device = new Local({ root: "./uploads" });

await device.write("docs/report.pdf", buffer);
await device.exists("docs/report.pdf"); // true
await device.stat("docs/report.pdf");   // { size, mimeType }
```

### AWS S3

```typescript
import { S3 } from "@nuvix/storage";

const device = new S3({
  accessKeyId: "your-access-key",
  secretAccessKey: "your-secret-key",
  bucket: "your-bucket",
  region: S3.US_EAST_1,       // default
  acl: S3.ACL_PRIVATE,        // optional
  root: "app-uploads",        // optional key prefix
  endpoint: "https://...",    // optional custom endpoint (path-style URLs)
});

// Presigned URL — computed locally, no network round-trip
const url = device.presign("reports/q3.pdf", { expiresIn: 3600 });
```

### Wasabi

```typescript
import { Wasabi } from "@nuvix/storage";

// Endpoint is derived automatically: https://s3.{region}.wasabisys.com
const device = new Wasabi({
  accessKeyId: "your-access-key",
  secretAccessKey: "your-secret-key",
  bucket: "your-bucket",
  region: Wasabi.EU_CENTRAL_1, // default
});
```

### MinIO

```typescript
import { MinIO } from "@nuvix/storage";

const device = new MinIO({
  accessKeyId: "minioadmin",
  secretAccessKey: "minioadmin",
  bucket: "your-bucket",
  endpoint: "localhost:9000", // default; protocol prefix is stripped
  useSSL: false,              // default
});
```

## File Validation

```typescript
import { FileExt, FileName, FileSize, FileType, Upload } from "@nuvix/storage";

new FileExt(["jpg", "png"]).isValid("photo.jpg");     // true
new FileName().isValid("report_2024.pdf");            // true
new FileSize(5 * 1024 * 1024).isValid(1024);          // true (< 5MB)

// Content-type check via magic bytes — reads only the first few bytes of the file
await new FileType([FileType.FILE_TYPE_PNG]).isValid("./maybe-image.png");

// Verifies the file actually exists on disk
await new Upload().isValid("./uploaded.txt");
```

## Error Handling

All failures throw a `StorageError` with a stable `code` you can branch on:

```typescript
import { StorageError } from "@nuvix/storage";

try {
  await device.read("missing.txt");
} catch (error) {
  if (error instanceof StorageError && error.code === "FILE_NOT_FOUND") {
    // handle gracefully
  }
}
```

| Code | Thrown when |
|------|-------------|
| `DEVICE_NOT_FOUND` | `Storage.getDevice()` with an unregistered name |
| `FILE_NOT_FOUND` | Reading/stat a missing file, or aborting an upload with no staged parts |
| `WRITE_FAILED` / `READ_FAILED` | Filesystem or S3 I/O failure |
| `UPLOAD_FAILED` | A chunk could not be staged |
| `TRANSFER_FAILED` | Cross-device transfer failed mid-stream |
| `DELETE_FAILED` | Deletion failed |
| `UNSUPPORTED_OPERATION` | e.g. `presign()` on a device without support |
| `INVALID_CONFIG` | Device constructed with missing credentials |

## Chunked Uploads

Upload large files in ordered chunks; the final chunk triggers assembly:

```typescript
const metadata = {};
for (let chunk = 1; chunk <= totalChunks; chunk++) {
  await device.uploadData(chunkBuffer, "big-file.bin", "application/octet-stream", chunk, totalChunks, metadata);
}

// Or give up and clean any staged parts:
await device.abort("big-file.bin");
```

## Device Registry & Utilities

```typescript
Storage.setDevice("avatars", device);   // register
Storage.getDevice("avatars");           // retrieve (throws DEVICE_NOT_FOUND)
Storage.exists("avatars");              // boolean
Storage.listDevices();                  // string[]
Storage.removeDevice("avatars");        // unregister

Storage.human(1536);                    // "1.54kB"
Storage.human(1048576, 2, "binary");    // "1.00MiB"
```

### Common Device Methods

Every device implements the same interface:

- `write(path, data, contentType?)` / `read(path, offset?, length?)`
- `upload(source, path, chunk?, chunks?, metadata?)` — move a file from disk into storage
- `uploadData(data, path, contentType, chunk?, chunks?, metadata?)` — upload raw data
- `exists(path)` / `delete(path)` / `deletePath(path)`
- `stat(path)` → `{ size, mimeType }`
- `getFileSize(path)` / `getFileMimeType(path)` / `getFileHash(path)` (MD5)
- `transfer(source, destination, targetDevice)` / `move(source, target)`
- `createDirectory(path)` / `getDirectorySize(path)` / `getFiles(dir)`
- `presign(path, options?)` — presigned URL where supported
- `getTransferChunkSize()` / `setTransferChunkSize(bytes)`

## Migrating from v1

v2.0.0 is a breaking release:

- **Bun only** — Node.js is no longer supported. The hand-rolled SigV4/XML client was replaced by `Bun.S3Client`.
- **Constructors take a single options object** instead of positional arguments:
  ```diff
  - new S3("root", accessKey, secretKey, bucket, S3.US_EAST_1)
  + new S3({ accessKeyId, secretAccessKey, bucket, region: S3.US_EAST_1, root: "root" })
  ```
- **ESM only** — CommonJS builds are no longer published.
- **Errors are typed** — methods throw `StorageError` (with `.code`) instead of plain `Error`s or silent booleans.
- **Fixed:** `S3.SA_EAST_1` now maps to `"sa-east-1"` (previously incorrectly mapped to `"eu-north-1"`).
- **New:** `stat()`, `presign()`, `Storage.removeDevice()`, `Storage.listDevices()`, `move()`, `abort()`.

## Development

```bash
bun install          # install dev dependencies
bun test             # run test suite
bun run test:watch   # watch mode
bun run lint         # oxlint
bun run typecheck    # tsc --noEmit
bun run build        # bundle to dist/ (ESM + declarations)
```

Tests that hit real cloud services stay skipped unless credentials are provided via environment variables (`AWS_*`, `WASABI_*`, `MINIO_*`).

## Contributing

Contributions are welcome! Please ensure `bun test`, `bun run lint`, and `bun run typecheck` all pass before opening a PR.

## License

MIT © [Nuvix](https://github.com/nuvix-tech/storage)

## Links

- [GitHub Repository](https://github.com/nuvix-tech/storage)
- [NPM Package](https://www.npmjs.com/package/@nuvix/storage)
- [Issue Tracker](https://github.com/nuvix-tech/storage/issues)
