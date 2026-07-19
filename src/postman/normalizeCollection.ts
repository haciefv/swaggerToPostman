import { SAFE_AUTH_VARIABLE_NAMES, DEFAULT_COLLECTION_NAME } from "../shared/constants";
import type { ConversionSettings, SecurityVariable, SpecificationMetadata } from "../shared/types";

interface PostmanVariable {
  key: string;
  value: string;
  type: string;
}

/** Removes undefined/NaN/function/circular values so the result is always valid JSON. */
export function sanitizeForJson<T>(value: T): T {
  const seen = new WeakSet<object>();
  const clean = (input: unknown): unknown => {
    if (input === undefined) return undefined;
    if (typeof input === "number" && !Number.isFinite(input)) return null;
    if (typeof input === "function") return undefined;
    if (input === null || typeof input !== "object") return input;
    if (seen.has(input as object)) return undefined;
    seen.add(input as object);

    if (Array.isArray(input)) {
      return input.map((item) => clean(item)).filter((item) => item !== undefined);
    }

    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
      const cleaned = clean(val);
      if (cleaned !== undefined) result[key] = cleaned;
    }
    return result;
  };
  return JSON.parse(JSON.stringify(clean(value)));
}

function sanitizeFilenameSegment(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function resolveCollectionName(
  specInfoTitle: string | undefined,
  pageTitle: string | undefined,
  baseUrl: string | undefined
): string {
  if (specInfoTitle && specInfoTitle.trim().length > 0) return specInfoTitle.trim();
  if (pageTitle && pageTitle.trim().length > 0) return pageTitle.trim();
  if (baseUrl) {
    try {
      return new URL(baseUrl).hostname;
    } catch {
      // ignore malformed URL, fall through to default
    }
  }
  return DEFAULT_COLLECTION_NAME;
}

export function buildApiFilenameBase(collectionName: string): string {
  const sanitized = sanitizeFilenameSegment(collectionName);
  return sanitized.length > 0 ? sanitized : "api";
}

function collectSecuritySchemeTypes(spec: Record<string, unknown>): Set<string> {
  const types = new Set<string>();
  const components = spec["components"];
  const schemes =
    components && typeof components === "object"
      ? (components as { securitySchemes?: unknown }).securitySchemes
      : spec["securityDefinitions"];

  if (schemes && typeof schemes === "object") {
    for (const scheme of Object.values(schemes as Record<string, unknown>)) {
      if (!scheme || typeof scheme !== "object") continue;
      const type = (scheme as { type?: unknown }).type;
      const schemeName = (scheme as { scheme?: unknown }).scheme;
      if (type === "http" && schemeName === "bearer") types.add("bearer");
      else if (type === "apiKey") types.add("apiKey");
      else if (type === "http" && schemeName === "basic") types.add("basic");
      else if (type === "basic") types.add("basic");
      else if (type === "oauth2") types.add("oauth2");
    }
  }
  return types;
}

/** Builds safe placeholder variables — never copies a real credential value from the page. */
export function buildSecurityVariables(spec: Record<string, unknown>): SecurityVariable[] {
  const types = collectSecuritySchemeTypes(spec);
  const variables: SecurityVariable[] = [];

  if (types.has("bearer") || types.has("oauth2")) {
    variables.push({ key: "accessToken", value: "", placeholderNote: "Bearer {{accessToken}}" });
  }
  if (types.has("apiKey")) {
    variables.push({ key: "apiKey", value: "", placeholderNote: "{{apiKey}}" });
  }
  if (types.has("basic")) {
    variables.push({ key: "username", value: "", placeholderNote: "{{username}}" });
    variables.push({ key: "password", value: "", placeholderNote: "{{password}}" });
  }
  if (types.has("oauth2")) {
    variables.push({ key: "clientId", value: "", placeholderNote: "{{clientId}}" });
    variables.push({ key: "clientSecret", value: "", placeholderNote: "{{clientSecret}}" });
  }

  // Deduplicate while preserving the canonical safe-name order.
  const byKey = new Map(variables.map((v) => [v.key, v]));
  return SAFE_AUTH_VARIABLE_NAMES.filter((key) => byKey.has(key)).map((key) => byKey.get(key) as SecurityVariable);
}

function replaceBaseUrlOccurrences(node: unknown, baseUrl: string): unknown {
  if (typeof node === "string") {
    return node.includes(baseUrl) ? node.split(baseUrl).join("{{baseUrl}}") : node;
  }
  if (Array.isArray(node)) {
    return node.map((item) => replaceBaseUrlOccurrences(item, baseUrl));
  }
  if (node && typeof node === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      result[key] = replaceBaseUrlOccurrences(value, baseUrl);
    }
    return result;
  }
  return node;
}

export interface NormalizeCollectionArgs {
  collection: Record<string, unknown>;
  spec: Record<string, unknown>;
  metadata: SpecificationMetadata;
  settings: ConversionSettings;
  pageTitle?: string;
}

/** Applies collection naming, {{baseUrl}} substitution, and safe auth placeholders. */
export function normalizePostmanCollection(args: NormalizeCollectionArgs): Record<string, unknown> {
  const { collection, spec, metadata, pageTitle } = args;
  const primaryServer = metadata.servers[0];
  const specTitle =
    metadata.title && metadata.title !== DEFAULT_COLLECTION_NAME ? metadata.title : undefined;
  const collectionName = resolveCollectionName(specTitle, pageTitle, primaryServer);

  const variables: PostmanVariable[] = [];
  let normalized = collection;

  if (primaryServer) {
    variables.push({ key: "baseUrl", value: primaryServer, type: "string" });
    normalized = replaceBaseUrlOccurrences(normalized, primaryServer) as Record<string, unknown>;
  }

  for (const secVar of buildSecurityVariables(spec)) {
    variables.push({ key: secVar.key, value: secVar.value, type: "string" });
  }

  const info = (normalized["info"] as Record<string, unknown> | undefined) ?? {};
  normalized = {
    ...normalized,
    info: { ...info, name: collectionName },
    variable: [...(Array.isArray(normalized["variable"]) ? (normalized["variable"] as unknown[]) : []), ...variables]
  };

  return sanitizeForJson(normalized);
}
