import { extractSwaggerUiStateInPage, collectPageResourceUrlsInPage } from "./extractFromSwaggerUi";
import { fetchSpecificationText, isSameOrigin } from "./fetchSpecification";
import { parseSpecificationText, normalizeParsedSpecification } from "./parseSpecification";
import { assertValidSpecificationShape, buildMetadata } from "./validateSpecification";
import { RESOURCE_URL_PATTERNS, FALLBACK_SPEC_PATHS } from "../shared/constants";
import { AppError } from "../shared/errors";
import type { DetectedSpecification, DetectionResult, SpecificationCandidate } from "../shared/types";

async function tryLoadCandidate(
  url: string,
  source: DetectedSpecification["source"],
  name: string
): Promise<{ detected: DetectedSpecification; metadata: ReturnType<typeof buildMetadata> } | null> {
  try {
    const text = await fetchSpecificationText(url);
    const spec = parseSpecificationText(text);
    assertValidSpecificationShape(spec);
    const metadata = buildMetadata(spec, name, url);
    return { detected: { source, name: metadata.title, url, specification: spec }, metadata };
  } catch {
    return null;
  }
}

export async function detectSwaggerSpecification(tabId: number): Promise<DetectionResult> {
  const tab = await chrome.tabs.get(tabId);
  const tabUrl = tab.url;
  if (!tabUrl) return { status: "not-found" };

  let pageTitle = tab.title ?? "";

  // Strategy 1 & 2: read Swagger UI's loaded Redux state / config in the page's MAIN world.
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: extractSwaggerUiStateInPage
    });
    const result = injection?.result;
    if (result) {
      pageTitle = result.pageTitle || pageTitle;

      if (result.specification) {
        const normalized = normalizeParsedSpecification(result.specification);
        try {
          assertValidSpecificationShape(normalized);
          const metadata = buildMetadata(normalized, pageTitle, result.configUrl ?? undefined);
          return {
            status: "detected",
            detected: { source: "swagger-ui", name: metadata.title, url: result.configUrl ?? undefined, specification: normalized },
            metadata,
            alternatives: buildAlternatives(result.configUrls)
          };
        } catch {
          // fall through to config-based strategies
        }
      }

      if (result.configSpec) {
        const normalized = normalizeParsedSpecification(result.configSpec);
        try {
          assertValidSpecificationShape(normalized);
          const metadata = buildMetadata(normalized, pageTitle);
          return {
            status: "detected",
            detected: { source: "config-url", name: metadata.title, specification: normalized },
            metadata,
            alternatives: buildAlternatives(result.configUrls)
          };
        } catch {
          // fall through
        }
      }

      const candidateUrls: string[] = [];
      if (result.configUrls && result.configUrls.length > 0) {
        candidateUrls.push(...result.configUrls.map((c) => c.url));
      } else if (result.configUrl) {
        candidateUrls.push(result.configUrl);
      }

      for (const candidateUrl of candidateUrls) {
        const absolute = toAbsoluteUrl(candidateUrl, tabUrl);
        if (!absolute) continue;
        const loaded = await tryLoadCandidate(absolute, "config-url", pageTitle);
        if (loaded) {
          return {
            status: "detected",
            detected: loaded.detected,
            metadata: loaded.metadata,
            alternatives: buildAlternatives(result.configUrls)
          };
        }
      }
    }
  } catch {
    // scripting injection failed (e.g. restricted page); continue to other strategies
  }

  // Strategy 3: inspect already-loaded page resources for likely spec URLs.
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: collectPageResourceUrlsInPage
    });
    const resourceUrls = injection?.result ?? [];
    const likely = resourceUrls.filter(
      (url) => RESOURCE_URL_PATTERNS.some((pattern) => url.includes(pattern)) && isSameOrigin(url, tabUrl)
    );
    for (const url of likely) {
      const loaded = await tryLoadCandidate(url, "resource", pageTitle);
      if (loaded) {
        return { status: "detected", detected: loaded.detected, metadata: loaded.metadata, alternatives: [] };
      }
    }
  } catch {
    // ignore and continue
  }

  // Strategy 4: common same-origin fallback endpoints.
  const origin = new URL(tabUrl).origin;
  for (const path of FALLBACK_SPEC_PATHS) {
    const loaded = await tryLoadCandidate(`${origin}${path}`, "fallback", pageTitle);
    if (loaded) {
      return { status: "detected", detected: loaded.detected, metadata: loaded.metadata, alternatives: [] };
    }
  }

  return { status: "not-found" };
}

export async function detectFromManualUrl(url: string, fallbackName: string): Promise<DetectionResult> {
  const loaded = await tryLoadCandidate(url, "manual", fallbackName);
  if (!loaded) {
    throw new AppError("SPEC_FETCH_FAILED", `Manual URL failed: ${url}`);
  }
  return { status: "detected", detected: loaded.detected, metadata: loaded.metadata, alternatives: [] };
}

function buildAlternatives(configUrls: Array<{ url: string; name?: string }> | null): SpecificationCandidate[] {
  if (!configUrls) return [];
  return configUrls.map((entry, index) => ({ name: entry.name ?? `API ${index + 1}`, url: entry.url }));
}

function toAbsoluteUrl(candidate: string, baseUrl: string): string | null {
  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return null;
  }
}
