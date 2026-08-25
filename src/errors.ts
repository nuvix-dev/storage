/**
 * Error codes thrown by storage devices.
 */
export type StorageErrorCode =
  | "DEVICE_NOT_FOUND"
  | "FILE_NOT_FOUND"
  | "WRITE_FAILED"
  | "READ_FAILED"
  | "DELETE_FAILED"
  | "UPLOAD_FAILED"
  | "TRANSFER_FAILED"
  | "UNSUPPORTED_OPERATION"
  | "INVALID_CONFIG";

/**
 * Typed error thrown by all storage devices.
 *
 * Lets callers branch on `error.code` instead of parsing messages.
 */
export class StorageError extends Error {
  readonly code: StorageErrorCode;
  readonly path?: string;

  constructor(code: StorageErrorCode, message: string, path?: string) {
    super(message);
    this.name = "StorageError";
    this.code = code;
    this.path = path;
  }
}
