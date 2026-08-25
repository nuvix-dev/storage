import { describe, test, expect } from "bun:test";
import { FileName } from "../../src/validator/file-name";

describe("FileName Validator", () => {
  const validator = new FileName();

  test("accepts alphanumeric names with dots", () => {
    expect(validator.isValid("validfile123.txt")).toBe(true);
    expect(validator.isValid("archive.tar.gz")).toBe(true);
  });

  test("rejects special characters", () => {
    expect(validator.isValid("invalid-file.txt")).toBe(false);
    expect(validator.isValid("file name.txt")).toBe(false);
    expect(validator.isValid("../escape.txt")).toBe(false);
  });

  test("rejects empty and non-string values", () => {
    expect(validator.isValid("")).toBe(false);
    expect(validator.isValid(null)).toBe(false);
    expect(validator.isValid(undefined)).toBe(false);
    expect(validator.isValid(123 as unknown as string)).toBe(false);
  });
});
