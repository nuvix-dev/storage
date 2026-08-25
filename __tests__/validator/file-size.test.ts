import { describe, test, expect } from "bun:test";
import { FileSize } from "../../src/validator/file-size";

describe("FileSize Validator", () => {
  const max = 5 * 1024 * 1024;
  const validator = new FileSize(max);

  test("accepts sizes within the limit", () => {
    expect(validator.isValid(0)).toBe(true);
    expect(validator.isValid(1024)).toBe(true);
    expect(validator.isValid(max)).toBe(true);
  });

  test("rejects sizes above the limit", () => {
    expect(validator.isValid(max + 1)).toBe(false);
  });

  test("rejects negative and non-integer values", () => {
    expect(validator.isValid(-1)).toBe(false);
    expect(validator.isValid(1.5)).toBe(false);
    expect(validator.isValid("1024" as unknown as number)).toBe(false);
  });

  test("provides a description", () => {
    expect(validator.getDescription()).toContain("bigger than");
  });
});
