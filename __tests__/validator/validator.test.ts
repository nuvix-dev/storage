import { describe, test, expect } from "bun:test";
import { Validator } from "../../src/validator/validator";

class TestValidator extends Validator {
  isValid(value: any): boolean {
    return typeof value === "string";
  }
}

describe("Validator Base Class", () => {
  const validator = new TestValidator();

  test("exposes type constants", () => {
    expect(Validator.TYPE_STRING).toBe("string");
    expect(Validator.TYPE_ARRAY).toBe("array");
    expect(Validator.TYPE_INTEGER).toBe("integer");
    expect(Validator.TYPE_BOOLEAN).toBe("boolean");
  });

  test("supports concrete isValid implementations", () => {
    expect(validator.isValid("test")).toBe(true);
    expect(validator.isValid(123)).toBe(false);
    expect(validator.isValid(null)).toBe(false);
  });
});
