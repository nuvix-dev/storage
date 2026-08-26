# Migrating from v1.x to v2.0.0

This guide covers every breaking change in `@nuvix/storage` v2.0.0 and how to update your code.

## Why v2 exists

v1 shipped a hand-rolled implementation: manual AWS SigV4 signing, hand-parsed XML responses, raw multipart upload management, and Jest/tsup tooling. v2 replaces all of it with [Bun](https://bun.sh)'s native APIs (`Bun.S3Client`, `Bun.file`, `bun:test`). The result is **~3,700 fewer lines**, **zero runtime dependencies**, and native support for presigned URLs, multipart assembly, and retries.

---

## 1. Runtime requirement: Bun only

**Breaking.** v2 requires **[Bun](https://bun.sh) >= 1.2.0**. Node.js is no longer supported — the library imports `bun` internals directly.

```diff
- node dist/index.js        # ❌ no longer works
+ bun dist/index.js         # ✅
```

If your project runs on Node.js, stay on `@nuvix/storage@^1`.

## 2. Module format: ESM only

**Breaking.** CommonJS builds are no longer published. `require("@nuvix/storage")` will fail.

```diff
- const { Storage, Local } = require("@nuvix/storage");
+ import { Storage, Local } from "@nuvix/storage";
```

## 3. Device constructors take an options object

**Breaking.** All cloud devices now accept a single typed options object instead of positional arguments. This was done because positional argument lists had become error-prone (easy to swap `region` and `acl`, impossible to skip `endpoint`).

### AWS S3

```diff
- const device = new S3(
-   "app-uploads",          // root
-   accessKey,              // access key id
-   secretKey,              // secret access key
-   "my-bucket",            // bucket
-   S3.US_EAST_1,           // region
-   S3.ACL_PRIVATE,         // acl (optional)
- );
+ const device = new S3({
+   accessKeyId: accessKey,
+   secretAccessKey: secretKey,
+   bucket: "my-bucket",
+   region: S3.US_EAST_1,     // optional, default: us-east-1
+   acl: S3.ACL_PRIVATE,      // optional
+   root: "app-uploads",      // optional key prefix
+ });
```

Full `S3Options`:

| Option | Type | Default | Notes |
|---|---|---|---|
| `accessKeyId` | `string` | — | **required** |
| `secretAccessKey` | `string` | — | **required** |
| `bucket` | `string` | — | **required** |
| `root` | `string` | `""` | Key prefix for all files |
| `region` | `string` | `us-east-1` | Any `S3.*_1` constant |
| `acl` | `string` | — | Any `S3.ACL_*` constant |
| `endpoint` | `string` | AWS default | Custom S3-compatible endpoint (path-style URLs) |
| `sessionToken` | `string` | — | For temporary credentials |
| `partSize` | `number` | 5 MiB | Part size when assembling chunked uploads |
| `queueSize` | `number` | 5 | Parallel part uploads during assembly |
| `retry` | `number` | 3 | Retry attempts per part |

Missing required options now throw `StorageError("INVALID_CONFIG")` at construction time instead of failing later at request time.

### Wasabi

```diff
- const device = new Wasabi("root", accessKey, secretKey, "bucket", Wasabi.US_CENTRAL_1);
+ const device = new Wasabi({
+   accessKeyId: accessKey,
+   secretAccessKey: secretKey,
+   bucket: "bucket",
+   region: Wasabi.US_CENTRAL_1,  // optional, default: eu-central-1
+ });
```

The endpoint is derived automatically (`https://s3.{region}.wasabisys.com`) — you can no longer (and never needed to) set it manually.

### MinIO

```diff
- const device = new MinIO("root", "minioadmin", "minioadmin", "bucket", "localhost:9000", MinIO.ACL_PRIVATE, false);
+ const device = new MinIO({
+   accessKeyId: "minioadmin",
+   secretAccessKey: "minioadmin",
+   bucket: "bucket",
+   endpoint: "localhost:9000",  // optional, default; protocol prefixes stripped
+   useSSL: false,               // optional, default: false
+ });
```

### Local

**No change.** `new Local(root?: string)` keeps its positional string argument:

```typescript
const device = new Local("./uploads"); // unchanged from v1
const cwd    = new Local();            // defaults to process.cwd()
```

## 4. Typed errors replace generic errors and silent failures

**Breaking (mostly).** Failures now throw `StorageError` with a machine-readable `code`, so you can branch without parsing messages:

```typescript
import { StorageError } from "@nuvix/storage";

try {
  await device.read(path);
} catch (error) {
  if (error instanceof StorageError) {
    switch (error.code) {
      case "FILE_NOT_FOUND": ...
      case "READ_FAILED":   ...
    }
  }
}
```

| Code | Thrown when |
|---|---|
| `DEVICE_NOT_FOUND` | `Storage.getDevice()` with unregistered name |
| `FILE_NOT_FOUND` | Reading/stating a missing file; aborting with nothing staged |
| `WRITE_FAILED` / `READ_FAILED` | Filesystem or S3 I/O failure |
| `UPLOAD_FAILED` | A chunk could not be staged |
| `TRANSFER_FAILED` | Cross-device transfer failed mid-stream |
| `DELETE_FAILED` | Deletion failed |
| `UNSUPPORTED_OPERATION` | e.g. `presign()` where unsupported |
| `INVALID_CONFIG` | Missing constructor credentials |

Migration notes:

- `Storage.getDevice("missing")` still throws the same *message* (`The device "missing" is not listed`), but the error is now a `StorageError` with `code === "DEVICE_NOT_FOUND"`. Code matching on `error.message` keeps working; matching on `instanceof Error` keeps working.
- If you relied on methods silently returning `false`/`0` for operational failures, wrap calls in try/catch — most hard failures now throw.

## 5. Removed APIs

| Removed | Replacement |
|---|---|
| `S3.METHOD_GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS/CONNECT/TRACE` | Not needed — HTTP verbs are handled internally by `Bun.S3Client`. Use `presign({ method })` if you need verb-scoped URLs. |
| Internal `headers` state (`(device as any).headers.host`) | Use `presign()` to inspect generated URLs |
| Manual multipart bookkeeping around `uploadData` on S3 | Handled internally; see §7 |

## 6. New capabilities (additive)

These didn't exist in v1 — no migration needed, but they replace common workarounds:

```typescript
// One-call stat (previously: getFileSize + getFileMimeType separately)
const { size, mimeType, etag, lastModified } = await device.stat(path);

// Presigned URLs (computed locally, no network round-trip)
const url = device.presign("reports/q3.pdf", { expiresIn: 3600 });

// Move within a device (Local uses atomic rename)
await device.move("tmp/incoming.pdf", "docs/incoming.pdf");

// Abort a chunked upload and clean staged parts
await device.abort("big-file.bin");

// Registry management
Storage.listDevices();          // string[]
Storage.removeDevice("old");    // unregister
```

## 7. Chunked uploads: internal behavior changed

The public contract is unchanged — keep passing the **same `metadata` object** across `uploadData` calls, and the final chunk triggers assembly:

```typescript
const metadata = {};
for (let chunk = 1; chunk <= totalChunks; chunk++) {
  await device.uploadData(buf, "big.bin", "application/octet-stream", chunk, totalChunks, metadata);
}
```

What changed under the hood (matters if you inspected storage directly):

- **Local**: chunks stage as files named `{name}.part.N` inside a `tmp_{basename}` directory next to the target (v1 used a log-file-based counter). Staging is cleaned up after assembly or `abort()`.
- **S3/Wasabi/MinIO**: each chunk is written to a sibling object `{key}.part-NNNNN`, then assembled via a native multipart writer on the final chunk; part objects are deleted afterwards. Do not run lifecycle rules that would expire these mid-upload.

## 8. Bug fixes you may have been working around

- **`S3.SA_EAST_1`** mapped to `"eu-north-1"` in v1 (wrong region!). It now correctly maps to `"sa-east-1"`. If you hardcoded `"eu-north-1"` to work around this, use `S3.SA_EAST_1`.
- **FileType validator** previously loaded the entire file into memory to check magic bytes; it now reads only the first few bytes. Results are unchanged (and binary signatures are compared byte-exactly).
- **MinIO endpoints** containing protocol prefixes (`https://play.min.io`) are normalized instead of producing malformed hosts.

## 9. Tooling changes (contributors)

| v1 | v2 |
|---|---|
| Jest | `bun test` (`import { describe, test, expect } from "bun:test"`) |
| tsup/Rollup | `bun build` (ESM bundle) + `tsc --emitDeclarationOnly` (types) |
| ESLint/Prettier | oxlint (`.oxlintrc.json`) |
| npm/yarn scripts | bun scripts (`bun test`, `bun run lint`, `bun run typecheck`, `bun run build`) |

Dependencies dropped: `xml2js`, `jest`, `tsup`, and related tooling. Dev dependencies are now only `@types/bun`, `oxlint`, and `typescript`.

---

## Quick migration checklist

- [ ] Runtime is Bun ≥ 1.2.0 (or pin `@nuvix/storage@^1` if stuck on Node)
- [ ] All imports converted to ESM
- [ ] `new S3(...)` / `new Wasabi(...)` / `new MinIO(...)` calls converted to options objects
- [ ] Error handling updated for `StorageError.code`
- [ ] References to `S3.METHOD_*` constants removed
- [ ] No reliance on internal `headers` state
- [ ] Run `bun run typecheck` — TypeScript will flag every remaining breaking usage
