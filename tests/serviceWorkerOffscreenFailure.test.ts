import { describe, expect, it, vi } from "vitest";

interface CapturedListener {
  (message: unknown, sender: unknown, sendResponse: (response: unknown) => void): boolean;
}

interface ChromeStubOptions {
  createDocumentShouldFail: boolean;
}

async function importFreshServiceWorkerModule(options: ChromeStubOptions): Promise<CapturedListener> {
  let captured: CapturedListener | null = null;

  (globalThis as { chrome?: unknown }).chrome = {
    runtime: {
      onMessage: {
        addListener: (fn: CapturedListener) => {
          captured = fn;
        }
      },
      getURL: (path: string) => `chrome-extension://fake-id/${path}`,
      getContexts: async () => [],
      ContextType: { OFFSCREEN_DOCUMENT: "OFFSCREEN_DOCUMENT" }
    },
    offscreen: {
      Reason: { DOM_PARSER: "DOM_PARSER" },
      createDocument: async () => {
        if (options.createDocumentShouldFail) {
          throw new Error("simulated: offscreen document creation is unavailable in this environment");
        }
      }
    },
    storage: { sync: { get: async () => ({}), set: async () => undefined } },
    permissions: { contains: async () => false, request: async () => false },
    tabs: { get: async () => ({ url: "https://example.com", title: "Example" }), query: async () => [] },
    downloads: { download: async () => 1 },
    scripting: { executeScript: async () => [] }
  };

  vi.resetModules();
  await import("../src/background/service-worker.ts");

  if (!captured) throw new Error("service-worker.ts did not register a message listener");
  return captured;
}

function invoke(listener: CapturedListener, message: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    listener(message, {}, resolve);
  });
}

describe("service worker CONVERT_AND_DOWNLOAD when the offscreen document cannot be created", () => {
  it("returns a typed OFFSCREEN_CREATE_FAILED error instead of throwing or hanging", async () => {
    const listener = await importFreshServiceWorkerModule({ createDocumentShouldFail: true });

    const response = (await invoke(listener, {
      target: "service-worker",
      type: "CONVERT_AND_DOWNLOAD",
      payload: {
        detected: {
          source: "manual",
          name: "Test API",
          specification: { openapi: "3.0.0", info: { title: "Test API", version: "1.0.0" }, paths: {} }
        },
        metadata: {
          title: "Test API",
          specificationVersion: "3.0.0",
          endpointCount: 0,
          tagCount: 0,
          servers: []
        },
        settings: {
          folderStrategy: "Tags",
          parametersResolution: "Example",
          includeResponses: true,
          includeDeprecated: true,
          saveAs: false
        }
      }
    })) as { ok: boolean; error?: { code: string } };

    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe("OFFSCREEN_CREATE_FAILED");
  });
});
