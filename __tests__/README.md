# Storage Library Test Suite

This directory contains comprehensive tests for the Nuvix Storage library.

## Test Structure

### Core Tests

- `storage.test.ts` - Tests for the main Storage class
- `device/` - Tests for storage device implementations
  - `local.test.ts` - Local file system storage tests
  - `s3.test.ts` - AWS S3 storage tests
  - `wasabi.test.ts` - Wasabi storage tests (S3-compatible)
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

Tests use real implementations instead of mocks:

- **Local Device**: Uses temporary directories for file system operations
- **Wasabi Device**: Can use real Wasabi credentials if provided via environment variables
- **S3 Device**: Can use real AWS credentials if provided via environment variables

### Environment Variables for Real Cloud Tests

To run tests against real Wasabi storage, set these environment variables:

```bash
export WASABI_ACCESS_KEY="your-access-key"
export WASABI_SECRET_KEY="your-secret-key"
export WASABI_BUCKET="your-test-bucket"
```

To run tests against real AWS S3, set these environment variables:

```bash
export AWS_ACCESS_KEY="your-access-key"
export AWS_SECRET_KEY="your-secret-key"
export AWS_BUCKET="your-test-bucket"
```

**Note**: Some tests are marked as `skip` by default when real credentials are not provided to avoid unnecessary network calls and potential costs.

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
