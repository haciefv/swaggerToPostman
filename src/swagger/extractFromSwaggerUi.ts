/**
 * Functions in this file are serialized and injected via chrome.scripting.executeScript.
 * They must be fully self-contained (no closures over outer-scope variables/imports)
 * because they execute in the page's own JS context, not the extension's.
 */

export interface SwaggerUiExtractionResult {
  specification: Record<string, unknown> | null;
  configUrl: string | null;
  configUrls: Array<{ url: string; name?: string }> | null;
  configSpec: Record<string, unknown> | null;
  pageTitle: string;
}

/** Executed in the MAIN world of the page. Reads window.ui state — never DOM scraping. */
export function extractSwaggerUiStateInPage(): SwaggerUiExtractionResult {
  const result: SwaggerUiExtractionResult = {
    specification: null,
    configUrl: null,
    configUrls: null,
    configSpec: null,
    pageTitle: document.title
  };

  const win = window as unknown as {
    ui?: {
      specSelectors?: { specJson?: () => unknown };
      getConfigs?: () => Record<string, unknown>;
    };
  };

  try {
    const specJsonResult = win.ui?.specSelectors?.specJson?.();
    if (specJsonResult !== undefined && specJsonResult !== null) {
      const asObject =
        typeof (specJsonResult as { toJS?: unknown }).toJS === "function"
          ? (specJsonResult as { toJS: () => unknown }).toJS()
          : specJsonResult;
      if (asObject && typeof asObject === "object" && !Array.isArray(asObject)) {
        result.specification = asObject as Record<string, unknown>;
      }
    }
  } catch {
    // window.ui not present or shaped differently; strategies fall through
  }

  try {
    const configs = win.ui?.getConfigs?.();
    if (configs) {
      if (typeof configs["url"] === "string") result.configUrl = configs["url"] as string;
      if (Array.isArray(configs["urls"])) {
        result.configUrls = (configs["urls"] as unknown[])
          .filter((entry): entry is { url: string; name?: string } => {
            return !!entry && typeof entry === "object" && typeof (entry as { url?: unknown }).url === "string";
          })
          .map((entry) => ({ url: entry.url, name: entry.name }));
      }
      if (configs["spec"] && typeof configs["spec"] === "object" && !Array.isArray(configs["spec"])) {
        result.configSpec = configs["spec"] as Record<string, unknown>;
      }
    }
  } catch {
    // getConfigs unavailable
  }

  return result;
}

/** Executed in the page context (any world) to inspect already-loaded resource URLs. */
export function collectPageResourceUrlsInPage(): string[] {
  try {
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    return entries.map((entry) => entry.name);
  } catch {
    return [];
  }
}
