import Converter from "openapi-to-postmanv2";
import { AppError } from "../shared/errors";
import type { ConversionSettings } from "../shared/types";

export interface PostmanConversionInput {
  type: "json" | "yaml" | "string";
  data: Record<string, unknown> | string;
}

function isValidJsRegex(pattern: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/**
 * openapi-to-postmanv2 validates every JSON Schema `pattern` keyword against
 * Ajv's `format: "regex"` check, which is just `new RegExp(pattern)` under
 * the hood. Real-world specs are often authored/exported from Java or Python
 * tooling and can contain constructs JS's regex engine rejects outright —
 * most commonly a leading inline mode-modifier group like `(?i)` (PCRE/Python
 * syntax for case-insensitive; JS instead takes flags as RegExp's second
 * argument, not embedded in the pattern string). Converter.convert() fails
 * the whole conversion with "Provided API Specification is invalid" the
 * instant it hits one, so we fix or drop offending patterns before the spec
 * ever reaches the converter, rather than let one bad regex in one property
 * block conversion entirely.
 */
export function toJsCompatiblePattern(pattern: string): string | undefined {
  if (isValidJsRegex(pattern)) return pattern;

  const withoutInlineFlags = pattern.replace(/^\(\?[a-zA-Z-]+\)/, "");
  if (withoutInlineFlags !== pattern && isValidJsRegex(withoutInlineFlags)) {
    return withoutInlineFlags;
  }

  return undefined;
}

/** Deep-clones the spec, fixing or dropping any `pattern` value JS's RegExp can't parse. */
export function sanitizeSchemaPatterns<T>(node: T): T {
  if (Array.isArray(node)) {
    return node.map((item) => sanitizeSchemaPatterns(item)) as unknown as T;
  }
  if (node && typeof node === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "pattern" && typeof value === "string") {
        const fixed = toJsCompatiblePattern(value);
        if (fixed !== undefined) result[key] = fixed;
        continue; // drop patterns that can't be made JS-compatible
      }
      result[key] = sanitizeSchemaPatterns(value);
    }
    return result as T;
  }
  return node;
}

function toConverterOptions(settings: ConversionSettings): Record<string, unknown> {
  return {
    folderStrategy: settings.folderStrategy,
    requestParametersResolution: settings.parametersResolution,
    exampleParametersResolution: settings.parametersResolution,
    includeAuthInfoInExample: false,
    schemaFaker: true,
    includeResponses: settings.includeResponses,
    keepImplicitHeaders: false
  };
}

/** Wraps the callback-based Converter.convert API in a Promise and validates its result shape. */
export async function convertSpecificationToPostman(
  input: PostmanConversionInput,
  settings: ConversionSettings
): Promise<Record<string, unknown>> {
  const options = toConverterOptions(settings);
  const sanitizedInput: PostmanConversionInput =
    input.type === "json" && input.data && typeof input.data === "object"
      ? { ...input, data: sanitizeSchemaPatterns(input.data) }
      : input;

  type ConversionResult = {
    result: boolean;
    reason?: string;
    output?: Array<{ type: string; data: unknown }>;
  };

  const conversionResult = await new Promise<ConversionResult>((resolve, reject) => {
    try {
      Converter.convert(sanitizedInput, options, (error: Error | null | undefined, result: ConversionResult) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      });
    } catch (syncError) {
      reject(syncError);
    }
  }).catch((error: unknown) => {
    const details = error instanceof Error ? error.message : String(error);
    throw new AppError("CONVERSION_FAILED", details);
  });

  if (!conversionResult.result) {
    throw new AppError("CONVERSION_FAILED", conversionResult.reason ?? "Converter.convert returned result: false");
  }

  const collectionOutput = conversionResult.output?.[0];
  if (!collectionOutput || collectionOutput.type !== "collection" || !collectionOutput.data) {
    throw new AppError("CONVERSION_FAILED", "Converter output does not contain a valid collection");
  }

  return collectionOutput.data as Record<string, unknown>;
}
