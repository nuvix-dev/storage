# Storage Library Test Suite

This directory contains comprehensive tests for the Nuvix Storage library.

## Test Structure

### Core Tests

- `storage.test.ts` - Tests for the main Storage class
- `device/` - Tests for storage device implementations
  - `local.test.ts` - Local file system storage tests
  - `s3.test.ts` - AWS S3 storage tests
  - `wasabi.test.ts` - Wasabi storage tests (S3-compatible)
- `integration/` - Opt-in tests against a real MinIO server
  - `minio.integration.test.ts` - Real S3 protocol behavior (chunked assembly, abort cleanup, presigned URLs, transfers)
- `validator/` - Tests for file validation classes
  - `validator.test.ts` - Base validator class tests
  - `file.test.ts` - File validator tests
  - `file-ext.test.ts` - File extension validator tests
  - `file-name.test.ts` - File name validator tests
  - `file-size.test.ts` - File size validator tests
  - `file-type.test.ts` - File type (MIME) validator tests
  - `upload.test.ts` - Upload validator tests

## Running Tests

Tests run on Bun's native test runner (`bun:test`).

### All Tests

```bash
bun test
```

### With Coverage

```bash
bun run test:coverage
```

### Watch Mode

```bash
bun run test:watch
```

### Specific Test Files

```bash
# Run only storage tests
bun test storage.test.ts

# Run only device tests
bun test device/

# Run only validator tests
bun test validator/
```

## Test Configuration

The default suite is fully offline — cloud devices are exercised through offline-presign URL checks and config validation, so no credentials are ever needed.

### Integration Tests (opt-in)

`__tests__/integration/` runs against a real MinIO server and is **skipped automatically** unless `MINIO_TEST_URL` is set:

```bash
# Start MinIO and create the test bucket
docker run -d --name storage-test-minio -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin-test \
  minio/minio server /data --console-address ":9001"
docker exec storage-test-minio mc alias set local http://localhost:9000 minioadmin minioadmin-test
docker exec storage-test-minio mc mb --ignore-existing local/nuvix-storage-test

# Run the integration tests
MINIO_TEST_URL=http://localhost:9000 bun run test:integration
```

Environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `MINIO_TEST_URL` | *(unset = skip)* | MinIO endpoint, e.g. `http://localhost:9000` |
| `MINIO_TEST_USER` | `minioadmin` | Access key |
| `MINIO_TEST_PASSWORD` | `minioadmin-test` | Secret key |
| `MINIO_TEST_BUCKET` | `nuvix-storage-test` | Bucket name |

These tests cover real S3 protocol behavior the offline suite cannot: chunked upload assembly (byte-exact), abort cleanup of staged parts, presigned GET/PUT round-trips via `fetch`, and cross-device transfers.

## Test Coverage

The test suite aims for comprehensive coverage of:

- ✅ All public methods and properties
- ✅ Error handling and edge cases
- ✅ File system operations (local storage)
- ✅ Cloud storage operations (S3/Wasabi)
- ✅ Validation logic for all validator types
- ✅ Constructor parameters and configurations
- ✅ Async/await patterns
- ✅ Real-world usage scenarios

## Test Features

- **Real Implementation Testing**: Uses actual device implementations rather than mocks
- **Temporary File Handling**: Automatically creates and cleans up test files
- **Cross-Platform Compatibility**: Tests handle platform-specific differences
- **Error Simulation**: Tests various error conditions and recovery
- **Performance Considerations**: Tests with large files and concurrent operations
- **Security Testing**: Tests file permissions and access controls
- **Unicode Support**: Tests with international characters and special symbols

## Contributing

When adding new tests:

1. Follow the existing naming convention
2. Use real implementations when possible
3. Clean up any temporary files/resources
4. Test both success and failure scenarios
5. Add edge cases and boundary conditions
6. Document any special requirements or setup
