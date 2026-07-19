import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  convertSpecificationToPostman,
  sanitizeSchemaPatterns,
  toJsCompatiblePattern
} from "../src/postman/convertToPostman";
import { DEFAULT_CONVERSION_SETTINGS } from "../src/shared/types";
import { AppError } from "../src/shared/errors";

function loadFixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(__dirname, "fixtures", name), "utf-8"));
}

describe("convertSpecificationToPostman", () => {
  it("converts a valid OpenAPI 3 spec into a Postman collection", async () => {
    const collection = await convertSpecificationToPostman(
      { type: "json", data: loadFixture("openapi-3.json") },
      DEFAULT_CONVERSION_SETTINGS
    );
    expect(collection["info"]).toBeDefined();
    expect(Array.isArray(collection["item"])).toBe(true);
  });

  it("converts a valid Swagger 2.0 spec into a Postman collection", async () => {
    const collection = await convertSpecificationToPostman(
      { type: "json", data: loadFixture("swagger-2.json") },
      DEFAULT_CONVERSION_SETTINGS
    );
    expect(collection["info"]).toBeDefined();
  });

  it("converts a spec with duplicate operationId values without throwing", async () => {
    const spec = loadFixture("swagger-2.json");
    (spec["paths"] as Record<string, unknown>)["/users/{id}"] = {
      get: { tags: ["Users"], operationId: "listUsers", responses: { 200: { description: "OK" } } }
    };
    await expect(
      convertSpecificationToPostman({ type: "json", data: spec }, DEFAULT_CONVERSION_SETTINGS)
    ).resolves.toBeDefined();
  });

  it("converts a spec with empty paths into an empty-item collection", async () => {
    const collection = await convertSpecificationToPostman(
      { type: "json", data: { openapi: "3.0.0", info: { title: "Empty", version: "1.0" }, paths: {} } },
      DEFAULT_CONVERSION_SETTINGS
    );
    expect(collection["item"]).toEqual([]);
  });

  it("throws CONVERSION_FAILED for a document that is not a Swagger/OpenAPI spec", async () => {
    await expect(
      convertSpecificationToPostman({ type: "json", data: loadFixture("invalid-spec.json") }, DEFAULT_CONVERSION_SETTINGS)
    ).rejects.toThrow(AppError);
  });

  it("converts a spec containing a PCRE/Python-style '(?i)' regex pattern instead of failing on Ajv's format:\"regex\" check", async () => {
    const collection = await convertSpecificationToPostman(
      { type: "json", data: loadFixture("openapi-invalid-regex.json") },
      DEFAULT_CONVERSION_SETTINGS
    );
    expect(collection["info"]).toBeDefined();
    expect(Array.isArray(collection["item"])).toBe(true);
  });
});

describe("toJsCompatiblePattern", () => {
  it("passes through an already-valid JS regex unchanged", () => {
    expect(toJsCompatiblePattern("^[a-z]+$")).toBe("^[a-z]+$");
  });

  it("strips a leading (?i) inline flag group that JS regex doesn't support", () => {
    expect(toJsCompatiblePattern("(?i)operator|admin")).toBe("operator|admin");
  });

  it("returns undefined when the pattern can't be made JS-compatible", () => {
    expect(toJsCompatiblePattern("[unterminated")).toBeUndefined();
  });
});

describe("sanitizeSchemaPatterns", () => {
  it("fixes a nested pattern in place without mutating other fields", () => {
    const spec = {
      components: {
        schemas: {
          Role: { type: "string", pattern: "(?i)operator|admin" }
        }
      }
    };
    const sanitized = sanitizeSchemaPatterns(spec) as typeof spec;
    expect(sanitized.components.schemas.Role.pattern).toBe("operator|admin");
    expect(sanitized.components.schemas.Role.type).toBe("string");
  });

  it("drops an unfixable pattern rather than leaving invalid regex in place", () => {
    const spec = { properties: { id: { pattern: "[unterminated" } } };
    const sanitized = sanitizeSchemaPatterns(spec) as { properties: { id: Record<string, unknown> } };
    expect(sanitized.properties.id).not.toHaveProperty("pattern");
  });

  it("does not mutate the original input object", () => {
    const spec = { pattern: "(?i)x" };
    sanitizeSchemaPatterns(spec);
    expect(spec.pattern).toBe("(?i)x");
  });
});
