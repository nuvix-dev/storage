import { describe, test, expect } from "bun:test";
import { File } from "../../src/validator/file";
import { Validator } from "../../src/validator/validator";

describe("File Validator", () => {
  const fileValidator = new File();

  test("returns correct description", () => {
    expect(fileValidator.getDescription()).toBe("File is not valid");
  });

  test("is a placeholder that accepts any input", () => {
    expect(fileValidator.isValid("test.txt")).toBe(true);
    expect(fileValidator.isValid("")).toBe(true);
    expect(fileValidator.isValid(null)).toBe(true);
    expect(fileValidator.isValid(undefined)).toBe(true);
    expect(fileValidator.isValid(123 as unknown as string)).toBe(true);
  });

  test("extends Validator base class", () => {
    expect(fileValidator).toBeInstanceOf(Validator);
    expect(typeof fileValidator.isValid).toBe("function");
    expect(typeof fileValidator.getDescription).toBe("function");
  });
});
