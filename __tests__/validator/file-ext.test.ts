import { describe, test, expect } from "bun:test";
import { FileExt } from "../../src/validator/file-ext";

describe("FileExt Validator", () => {
  const validator = new FileExt(["jpg", "png", "gif"]);

  test("accepts allowed extensions (case-insensitive)", () => {
    expect(validator.isValid("photo.jpg")).toBe(true);
    expect(validator.isValid("photo.PNG")).toBe(true);
  });

  test("rejects disallowed extensions", () => {
    expect(validator.isValid("document.pdf")).toBe(false);
  });

  test("rejects files without extension", () => {
    expect(validator.isValid("noextension")).toBe(false);
  });
});
