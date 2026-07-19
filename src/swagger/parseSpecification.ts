import { load as loadYaml } from "js-yaml";
import { AppError } from "../shared/errors";

/**
 * Parses raw specification text as JSON first, falling back to YAML.
 * Swagger UI resource endpoints commonly serve either format regardless of extension.
 */
export function parseSpecificationText(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new AppError("INVALID_SPEC", "Empty response body");
  }

  try {
    const parsed = JSON.parse(trimmed);
    return assertObject(parsed);
  } catch {
    // fall through to YAML
  }

  try {
    const parsed = loadYaml(trimmed);
    return assertObject(parsed);
  } catch (yamlError) {
    const details = yamlError instanceof Error ? yamlError.message : String(yamlError);
    throw new AppError("INVALID_SPEC", `Could not be parsed as JSON or YAML: ${details}`);
  }
}

function assertObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AppError("INVALID_SPEC", "Specification must be an object at the root level");
  }
  return value as Record<string, unknown>;
}

/**
 * Normalizes an already-parsed specification, including Immutable.js results
 * from Swagger UI's Redux store (`specJson().toJS()`).
 */
export function normalizeParsedSpecification(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && "toJS" in value && typeof (value as { toJS: unknown }).toJS === "function") {
    return assertObject((value as { toJS: () => unknown }).toJS());
  }
  return assertObject(value);
}
