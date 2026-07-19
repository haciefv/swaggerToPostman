import { AppError } from "../shared/errors";
import type { SpecificationMetadata } from "../shared/types";

const SUPPORTED_SWAGGER_2_PREFIX = "2.";
const SUPPORTED_OPENAPI_PREFIXES = ["3.0", "3.1"];

export function detectSpecificationVersion(spec: Record<string, unknown>): string {
  const swagger = spec["swagger"];
  if (typeof swagger === "string") {
    if (swagger.startsWith(SUPPORTED_SWAGGER_2_PREFIX)) return swagger;
    throw new AppError("UNSUPPORTED_SPEC_VERSION", `swagger: ${swagger}`);
  }

  const openapi = spec["openapi"];
  if (typeof openapi === "string") {
    if (SUPPORTED_OPENAPI_PREFIXES.some((prefix) => openapi.startsWith(prefix))) return openapi;
    throw new AppError("UNSUPPORTED_SPEC_VERSION", `openapi: ${openapi}`);
  }

  throw new AppError("INVALID_SPEC", "Neither a 'swagger' nor an 'openapi' field was found");
}

/** Throws INVALID_SPEC if the object clearly isn't a Swagger/OpenAPI document. */
export function assertValidSpecificationShape(spec: Record<string, unknown>): void {
  detectSpecificationVersion(spec);
  if (typeof spec["paths"] !== "object" || spec["paths"] === null) {
    throw new AppError("INVALID_SPEC", "'paths' field not found");
  }
}

export function buildServersList(spec: Record<string, unknown>): string[] {
  const openapi = spec["openapi"];
  if (typeof openapi === "string") {
    const servers = spec["servers"];
    if (Array.isArray(servers)) {
      return servers
        .map((server) => (server && typeof server === "object" ? (server as { url?: unknown }).url : undefined))
        .filter((url): url is string => typeof url === "string" && url.length > 0);
    }
    return [];
  }

  // Swagger 2.0: construct from schemes/host/basePath
  const host = spec["host"];
  if (typeof host !== "string" || host.length === 0) return [];
  const basePath = typeof spec["basePath"] === "string" ? (spec["basePath"] as string) : "";
  const schemes = Array.isArray(spec["schemes"]) ? (spec["schemes"] as unknown[]) : ["https"];
  const validSchemes = schemes.filter((s): s is string => typeof s === "string" && s.length > 0);
  const effectiveSchemes = validSchemes.length > 0 ? validSchemes : ["https"];
  return effectiveSchemes.map((scheme) => `${scheme}://${host}${basePath}`);
}

export function countEndpoints(spec: Record<string, unknown>): number {
  const paths = spec["paths"];
  if (typeof paths !== "object" || paths === null) return 0;
  const methodNames = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];
  let count = 0;
  for (const pathItem of Object.values(paths as Record<string, unknown>)) {
    if (typeof pathItem !== "object" || pathItem === null) continue;
    for (const method of methodNames) {
      if (method in (pathItem as Record<string, unknown>)) count += 1;
    }
  }
  return count;
}

export function countTags(spec: Record<string, unknown>): number {
  const topLevelTags = spec["tags"];
  const tagNames = new Set<string>();

  if (Array.isArray(topLevelTags)) {
    for (const tag of topLevelTags) {
      if (tag && typeof tag === "object" && typeof (tag as { name?: unknown }).name === "string") {
        tagNames.add((tag as { name: string }).name);
      }
    }
  }

  const paths = spec["paths"];
  if (typeof paths === "object" && paths !== null) {
    const methodNames = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];
    for (const pathItem of Object.values(paths as Record<string, unknown>)) {
      if (typeof pathItem !== "object" || pathItem === null) continue;
      for (const method of methodNames) {
        const operation = (pathItem as Record<string, unknown>)[method];
        if (operation && typeof operation === "object") {
          const tags = (operation as { tags?: unknown }).tags;
          if (Array.isArray(tags)) {
            for (const tag of tags) {
              if (typeof tag === "string") tagNames.add(tag);
            }
          }
        }
      }
    }
  }

  return tagNames.size;
}

export function buildMetadata(
  spec: Record<string, unknown>,
  fallbackTitle: string,
  specUrl?: string
): SpecificationMetadata {
  assertValidSpecificationShape(spec);
  const info = spec["info"];
  const title =
    info && typeof info === "object" && typeof (info as { title?: unknown }).title === "string"
      ? ((info as { title: string }).title as string)
      : fallbackTitle;
  const apiVersion =
    info && typeof info === "object" && typeof (info as { version?: unknown }).version === "string"
      ? ((info as { version: string }).version as string)
      : undefined;

  return {
    title,
    apiVersion,
    specificationVersion: detectSpecificationVersion(spec),
    endpointCount: countEndpoints(spec),
    tagCount: countTags(spec),
    servers: buildServersList(spec),
    specUrl
  };
}
