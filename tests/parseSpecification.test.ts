import { describe, expect, it } from "vitest";
import { parseSpecificationText, normalizeParsedSpecification } from "../src/swagger/parseSpecification";
import { AppError } from "../src/shared/errors";

describe("parseSpecificationText", () => {
  it("parses JSON specifications", () => {
    const spec = parseSpecificationText('{"openapi":"3.0.0","info":{"title":"X"}}');
    expect(spec["openapi"]).toBe("3.0.0");
  });

  it("parses YAML specifications", () => {
    const yaml = "openapi: 3.0.0\ninfo:\n  title: YAML API\n  version: '1.0'\npaths: {}\n";
    const spec = parseSpecificationText(yaml);
    expect((spec["info"] as { title: string }).title).toBe("YAML API");
  });

  it("throws INVALID_SPEC for invalid JSON/YAML", () => {
    expect(() => parseSpecificationText("{not valid: [")).toThrow(AppError);
  });

  it("throws INVALID_SPEC for an empty body", () => {
    expect(() => parseSpecificationText("   ")).toThrow(AppError);
  });

  it("preserves malicious HTML strings as inert text rather than stripping them", () => {
    const spec = parseSpecificationText('{"info":{"description":"<script>alert(1)</script>"}}');
    expect((spec["info"] as { description: string }).description).toBe("<script>alert(1)</script>");
  });
});

describe("normalizeParsedSpecification", () => {
  it("unwraps Immutable.js-like results via toJS()", () => {
    const fakeImmutable = { toJS: () => ({ openapi: "3.0.0" }) };
    const normalized = normalizeParsedSpecification(fakeImmutable);
    expect(normalized["openapi"]).toBe("3.0.0");
  });

  it("passes through plain objects unchanged", () => {
    const normalized = normalizeParsedSpecification({ swagger: "2.0" });
    expect(normalized["swagger"]).toBe("2.0");
  });
});
