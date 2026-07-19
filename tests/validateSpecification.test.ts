import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  detectSpecificationVersion,
  buildServersList,
  countEndpoints,
  countTags,
  buildMetadata,
  assertValidSpecificationShape
} from "../src/swagger/validateSpecification";
import { AppError } from "../src/shared/errors";

function loadFixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(__dirname, "fixtures", name), "utf-8"));
}

describe("detectSpecificationVersion", () => {
  it("detects Swagger 2.0", () => {
    expect(detectSpecificationVersion(loadFixture("swagger-2.json"))).toBe("2.0");
  });

  it("detects OpenAPI 3.0", () => {
    expect(detectSpecificationVersion(loadFixture("openapi-3.json"))).toBe("3.0.3");
  });

  it("detects OpenAPI 3.1", () => {
    expect(detectSpecificationVersion(loadFixture("openapi-3.1.json"))).toBe("3.1.0");
  });

  it("throws UNSUPPORTED_SPEC_VERSION for unknown openapi majors", () => {
    expect(() => detectSpecificationVersion({ openapi: "4.0.0" })).toThrow(AppError);
  });

  it("throws INVALID_SPEC when neither swagger nor openapi is present", () => {
    expect(() => detectSpecificationVersion(loadFixture("invalid-spec.json"))).toThrow(AppError);
  });
});

describe("assertValidSpecificationShape", () => {
  it("throws INVALID_SPEC when paths is missing", () => {
    expect(() => assertValidSpecificationShape({ openapi: "3.0.0" })).toThrow(AppError);
  });

  it("accepts specs with an empty paths object", () => {
    expect(() => assertValidSpecificationShape({ openapi: "3.0.0", paths: {} })).not.toThrow();
  });
});

describe("buildServersList", () => {
  it("reads servers[0].url for OpenAPI 3", () => {
    expect(buildServersList(loadFixture("openapi-3.json"))).toEqual(["https://api.zehyn.example.com/v2"]);
  });

  it("returns all servers when multiple are declared", () => {
    const servers = buildServersList(loadFixture("openapi-multiple-servers.json"));
    expect(servers).toEqual(["https://prod.example.com", "https://staging.example.com"]);
  });

  it("constructs base URL for Swagger 2 from schemes/host/basePath", () => {
    expect(buildServersList(loadFixture("swagger-2.json"))).toEqual(["https://api.zehyn.example.com/v1"]);
  });

  it("returns an empty list when there are no servers", () => {
    expect(buildServersList({ openapi: "3.0.0", paths: {} })).toEqual([]);
  });
});

describe("countEndpoints", () => {
  it("counts one entry per HTTP method", () => {
    expect(countEndpoints(loadFixture("swagger-2.json"))).toBe(3);
  });

  it("returns 0 for empty paths", () => {
    expect(countEndpoints({ paths: {} })).toBe(0);
  });
});

describe("countTags", () => {
  it("counts unique top-level and operation tags", () => {
    expect(countTags(loadFixture("swagger-2.json"))).toBe(2);
  });

  it("returns 0 when there are no tags anywhere", () => {
    expect(countTags(loadFixture("openapi-3.1.json"))).toBe(0);
  });
});

describe("buildMetadata", () => {
  it("builds full metadata for a valid spec", () => {
    const metadata = buildMetadata(loadFixture("openapi-3.json"), "fallback");
    expect(metadata.title).toBe("Zehyn Public API");
    expect(metadata.apiVersion).toBe("2.1.0");
    expect(metadata.endpointCount).toBe(2);
    expect(metadata.tagCount).toBe(1);
  });

  it("falls back to the provided title when info.title is missing", () => {
    const metadata = buildMetadata({ openapi: "3.0.0", paths: {} }, "Page Title Fallback");
    expect(metadata.title).toBe("Page Title Fallback");
  });
});
