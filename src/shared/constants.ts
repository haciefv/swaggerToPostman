export const RESOURCE_URL_PATTERNS = [
  "swagger.json",
  "openapi.json",
  "api-docs",
  "v3/api-docs",
  "v2/api-docs",
  "swagger.yaml",
  "openapi.yaml",
  "swagger.yml",
  "openapi.yml"
] as const;

export const FALLBACK_SPEC_PATHS = [
  "/swagger.json",
  "/openapi.json",
  "/swagger/v1/swagger.json",
  "/api/swagger.json",
  "/api/openapi.json",
  "/v2/api-docs",
  "/v3/api-docs",
  "/swagger.yaml",
  "/openapi.yaml"
] as const;

export const STORAGE_KEYS = {
  SETTINGS: "swaggerToPostmanSettings"
} as const;

export const FETCH_TIMEOUT_MS = 10_000;

export const DEFAULT_COLLECTION_NAME = "Generated API Collection";

export const SAFE_AUTH_VARIABLE_NAMES = [
  "accessToken",
  "apiKey",
  "username",
  "password",
  "clientId",
  "clientSecret"
] as const;

export const ALLOWED_URL_PROTOCOLS = ["http:", "https:"] as const;
