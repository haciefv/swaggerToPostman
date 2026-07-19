import { describe, expect, it } from "vitest";
import { assertSafeSpecUrl, isSameOrigin } from "../src/swagger/fetchSpecification";
import { AppError } from "../src/shared/errors";

describe("assertSafeSpecUrl", () => {
  it("accepts http and https URLs", () => {
    expect(assertSafeSpecUrl("https://api.example.com/openapi.json").protocol).toBe("https:");
    expect(assertSafeSpecUrl("http://localhost:8080/swagger.json").protocol).toBe("http:");
  });

  it("rejects javascript: URLs", () => {
    expect(() => assertSafeSpecUrl("javascript:alert(1)")).toThrow(AppError);
  });

  it("rejects file: URLs", () => {
    expect(() => assertSafeSpecUrl("file:///etc/passwd")).toThrow(AppError);
  });

  it("rejects ftp: URLs", () => {
    expect(() => assertSafeSpecUrl("ftp://example.com/spec.json")).toThrow(AppError);
  });

  it("rejects malformed URLs", () => {
    expect(() => assertSafeSpecUrl("not a url")).toThrow(AppError);
  });
});

describe("isSameOrigin", () => {
  it("returns true for identical origins with different paths", () => {
    expect(isSameOrigin("https://example.com/a", "https://example.com/b")).toBe(true);
  });

  it("returns false for different hosts", () => {
    expect(isSameOrigin("https://example.com", "https://other.com")).toBe(false);
  });

  it("returns false for invalid URLs", () => {
    expect(isSameOrigin("not-a-url", "https://example.com")).toBe(false);
  });
});
