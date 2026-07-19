import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  sanitizeForJson,
  resolveCollectionName,
  buildApiFilenameBase,
  buildSecurityVariables,
  normalizePostmanCollection
} from "../src/postman/normalizeCollection";
import { DEFAULT_CONVERSION_SETTINGS } from "../src/shared/types";
import { buildMetadata } from "../src/swagger/validateSpecification";

function loadFixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(__dirname, "fixtures", name), "utf-8"));
}

describe("sanitizeForJson", () => {
  it("converts undefined and NaN to omitted/null values", () => {
    const input: Record<string, unknown> = { a: undefined, b: Number.NaN, c: "ok" };
    const cleaned = sanitizeForJson(input);
    expect(cleaned).toEqual({ b: null, c: "ok" });
  });

  it("breaks circular references instead of throwing", () => {
    const circular: Record<string, unknown> = { name: "root" };
    circular.self = circular;
    expect(() => sanitizeForJson(circular)).not.toThrow();
  });

  it("drops functions", () => {
    const cleaned = sanitizeForJson({ fn: () => 1, value: 1 } as unknown as Record<string, unknown>);
    expect(cleaned).toEqual({ value: 1 });
  });
});

describe("resolveCollectionName", () => {
  it("prefers spec info.title", () => {
    expect(resolveCollectionName("Zehyn API", "Page Title", "https://api.example.com")).toBe("Zehyn API");
  });

  it("falls back to the page title", () => {
    expect(resolveCollectionName(undefined, "Swagger UI Page", "https://api.example.com")).toBe("Swagger UI Page");
  });

  it("falls back to hostname when no title is available", () => {
    expect(resolveCollectionName(undefined, undefined, "https://api.example.com/v1")).toBe("api.example.com");
  });

  it("falls back to the default collection name as a last resort", () => {
    expect(resolveCollectionName(undefined, undefined, undefined)).toBe("Generated API Collection");
  });
});

describe("buildApiFilenameBase", () => {
  it("sanitizes spaces, punctuation, and case", () => {
    expect(buildApiFilenameBase("Zehyn API! v2.0")).toBe("zehyn-api-v2-0");
  });

  it("falls back to 'api' when nothing sanitizable remains", () => {
    expect(buildApiFilenameBase("!!!")).toBe("api");
  });
});

describe("buildSecurityVariables", () => {
  it("returns apiKey variable for Swagger 2 apiKey securityDefinitions", () => {
    const vars = buildSecurityVariables(loadFixture("swagger-2.json"));
    expect(vars.map((v) => v.key)).toEqual(["apiKey"]);
  });

  it("returns all applicable placeholder variables for OpenAPI 3 security schemes", () => {
    const vars = buildSecurityVariables(loadFixture("openapi-auth.json"));
    expect(vars.map((v) => v.key)).toEqual(["accessToken", "apiKey", "username", "password", "clientId", "clientSecret"]);
  });

  it("never includes a real secret value — only empty placeholders", () => {
    const vars = buildSecurityVariables(loadFixture("openapi-auth.json"));
    expect(vars.every((v) => v.value === "")).toBe(true);
  });
});

describe("normalizePostmanCollection", () => {
  it("adds a baseUrl variable and replaces literal occurrences with {{baseUrl}}", () => {
    const spec = loadFixture("openapi-3.json");
    const metadata = buildMetadata(spec, "fallback");
    const collection = {
      info: { name: "old" },
      item: [{ request: { url: { raw: "https://api.zehyn.example.com/v2/exams" } } }]
    };
    const normalized = normalizePostmanCollection({
      collection,
      spec,
      metadata,
      settings: DEFAULT_CONVERSION_SETTINGS
    });
    const variables = normalized["variable"] as Array<{ key: string; value: string }>;
    expect(variables.find((v) => v.key === "baseUrl")?.value).toBe("https://api.zehyn.example.com/v2");
    const item = (normalized["item"] as Array<{ request: { url: { raw: string } } }>)[0];
    expect(item?.request.url.raw).toBe("{{baseUrl}}/exams");
  });
});
