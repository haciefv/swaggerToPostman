import { registerHandlers, sendMessage } from "../shared/messages";
import { AppError } from "../shared/errors";
import type { ErrorCode } from "../shared/errors";
import { STORAGE_KEYS, ALLOWED_URL_PROTOCOLS } from "../shared/constants";
import { DEFAULT_CONVERSION_SETTINGS } from "../shared/types";
import type { ConversionSettings } from "../shared/types";
import { detectSwaggerSpecification, detectFromManualUrl } from "../swagger/detectSwagger";
import { normalizePostmanCollection, buildApiFilenameBase } from "../postman/normalizeCollection";
import { downloadPostmanCollection } from "../postman/downloadCollection";
import { buildMetadata } from "../swagger/validateSpecification";

/**
 * This module must stay browser-service-worker-safe: it must never statically
 * import openapi-to-postmanv2 (or anything in its dependency graph, e.g.
 * postman-collection, swagger2openapi, iconv-lite/safer-buffer). Those packages
 * assume a Buffer/stream-capable Node-like environment; when Vite externalizes
 * their Node built-in imports for a plain service worker bundle, the resulting
 * stub objects crash at module-evaluation time (see README "Known limitations"
 * for the confirmed root cause). All actual conversion happens in the offscreen
 * document (src/offscreen/offscreen.ts), which runs in a full DOM context.
 */

const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";

async function loadSettings(): Promise<ConversionSettings> {
  const stored = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
  const saved = stored[STORAGE_KEYS.SETTINGS] as Partial<ConversionSettings> | undefined;
  return { ...DEFAULT_CONVERSION_SETTINGS, ...saved };
}

async function hasOriginAccess(origin: string): Promise<boolean> {
  return chrome.permissions.contains({ origins: [`${origin}/*`] });
}

let creatingOffscreenDocument: Promise<void> | null = null;

async function hasOffscreenDocument(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
  });
  return contexts.length > 0;
}

/** Ensures exactly one offscreen document exists, guarding against concurrent creation. */
async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) return;

  if (!creatingOffscreenDocument) {
    creatingOffscreenDocument = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: [chrome.offscreen.Reason.DOM_PARSER],
        justification: "Convert a locally loaded OpenAPI specification into a Postman Collection."
      })
      .finally(() => {
        creatingOffscreenDocument = null;
      });
  }

  try {
    await creatingOffscreenDocument;
  } catch (error) {
    throw new AppError("OFFSCREEN_CREATE_FAILED", error instanceof Error ? error.message : String(error));
  }
}

function isPostmanCollectionShape(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const info = (value as Record<string, unknown>)["info"];
  const item = (value as Record<string, unknown>)["item"];
  return !!info && typeof info === "object" && Array.isArray(item);
}

registerHandlers("service-worker", {
  DETECT_SPEC: async ({ tabId }) => detectSwaggerSpecification(tabId),

  FETCH_SPEC_URL: async ({ url, tabId }) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new AppError("SPEC_FETCH_FAILED", `Invalid URL: ${url}`);
    }
    if (!ALLOWED_URL_PROTOCOLS.includes(parsed.protocol as (typeof ALLOWED_URL_PROTOCOLS)[number])) {
      throw new AppError("SPEC_FETCH_FAILED", `Unsupported protocol: ${parsed.protocol}`);
    }

    const tab = await chrome.tabs.get(tabId);
    const tabOrigin = tab.url ? new URL(tab.url).origin : undefined;
    if (parsed.origin !== tabOrigin) {
      const allowed = await hasOriginAccess(parsed.origin);
      if (!allowed) {
        throw new AppError("HOST_PERMISSION_DENIED", parsed.origin);
      }
    }

    return detectFromManualUrl(url, tab.title ?? parsed.hostname);
  },

  GET_SETTINGS: async () => loadSettings(),

  SAVE_SETTINGS: async ({ settings }) => {
    await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: settings });
    return settings;
  },

  CONVERT_AND_DOWNLOAD: async ({ detected, metadata, settings, pageTitle }) => {
    await ensureOffscreenDocument();

    const conversionResponse = await sendMessage("offscreen", "CONVERT_OPENAPI", {
      specification: detected.specification,
      settings
    });

    if (!conversionResponse.ok) {
      const code = conversionResponse.error?.code ?? "OFFSCREEN_CONVERSION_FAILED";
      throw new AppError(
        code === "MESSAGE_TIMEOUT" ? "CONVERTER_RUNTIME_INCOMPATIBLE" : (code as ErrorCode),
        conversionResponse.error?.technicalDetails
      );
    }

    const collection = conversionResponse.data;
    if (!isPostmanCollectionShape(collection)) {
      throw new AppError("OFFSCREEN_CONVERSION_FAILED", "Offscreen document returned an invalid collection shape");
    }

    const refreshedMetadata = buildMetadata(detected.specification, metadata.title, metadata.specUrl);
    const normalized = normalizePostmanCollection({
      collection,
      spec: detected.specification,
      metadata: refreshedMetadata,
      settings,
      pageTitle
    });

    const info = normalized["info"] as { name?: string } | undefined;
    const filenameBase = buildApiFilenameBase(info?.name ?? metadata.title);
    const downloadId = await downloadPostmanCollection(normalized, filenameBase, settings.saveAs);
    return { downloadId, filenameBase };
  },

  REQUEST_HOST_PERMISSION: async ({ origin }) => {
    let parsedOrigin: URL;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      throw new AppError("HOST_PERMISSION_DENIED", origin);
    }
    if (!ALLOWED_URL_PROTOCOLS.includes(parsedOrigin.protocol as (typeof ALLOWED_URL_PROTOCOLS)[number])) {
      throw new AppError("HOST_PERMISSION_DENIED", origin);
    }
    const granted = await chrome.permissions.request({ origins: [`${parsedOrigin.origin}/*`] });
    if (!granted) throw new AppError("HOST_PERMISSION_DENIED", origin);
    return { granted };
  }
});
