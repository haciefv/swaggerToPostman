// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

interface CapturedListener {
  (message: unknown, sender: unknown, sendResponse: (response: unknown) => void): boolean;
}

interface FakeIframe {
  src: string;
  style: { display: string };
  contentWindow: { postMessage: ReturnType<typeof vi.fn> };
  addEventListener: (type: string, listener: () => void, options?: unknown) => void;
  loadListener?: () => void;
}

function installChromeStub(): void {
  (globalThis as { chrome?: unknown }).chrome = {
    runtime: {
      onMessage: { addListener: (fn: CapturedListener) => capturedListeners.push(fn) },
      getURL: (path: string) => `chrome-extension://fake-id/${path}`
    }
  };
}

let capturedListeners: CapturedListener[] = [];
let lastFrame: FakeIframe | null = null;

async function importFreshOffscreenModule(): Promise<CapturedListener> {
  capturedListeners = [];
  lastFrame = null;
  installChromeStub();

  const realCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
    if (tagName !== "iframe") return realCreateElement(tagName);
    const listeners: Record<string, () => void> = {};
    const frame: FakeIframe = {
      src: "",
      style: { display: "" },
      contentWindow: { postMessage: vi.fn() },
      addEventListener: (type, listener) => {
        listeners[type] = listener;
      }
    };
    frame.loadListener = () => listeners.load?.();
    lastFrame = frame;
    return frame as unknown as HTMLIFrameElement;
  }) as typeof document.createElement);
  vi.spyOn(document.body, "appendChild").mockImplementation(((node: unknown) => node) as typeof document.body.appendChild);

  vi.resetModules();
  await import("../src/offscreen/offscreen.ts");

  const listener = capturedListeners[0];
  if (!listener) throw new Error("offscreen.ts did not register a message listener");
  return listener;
}

function invoke(listener: CapturedListener, message: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    listener(message, {}, resolve);
  });
}

describe("offscreen document CONVERT_OPENAPI handler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("proxies conversion to the sandboxed iframe and returns its result", async () => {
    const listener = await importFreshOffscreenModule();

    const responsePromise = invoke(listener, {
      target: "offscreen",
      type: "CONVERT_OPENAPI",
      payload: {
        specification: { openapi: "3.0.0", info: { title: "X", version: "1.0" }, paths: {} },
        settings: {
          folderStrategy: "Tags",
          parametersResolution: "Example",
          includeResponses: true,
          includeDeprecated: true,
          saveAs: false
        }
      }
    });

    // Let the handler create the iframe, then simulate its load event.
    await new Promise((r) => setTimeout(r, 0));
    expect(lastFrame).not.toBeNull();
    expect(lastFrame?.src).toContain("sandbox.html");
    lastFrame?.loadListener?.();

    // The iframe posted a CONVERT_OPENAPI request to its contentWindow; grab the requestId.
    await new Promise((r) => setTimeout(r, 0));
    const postedMessage = lastFrame?.contentWindow.postMessage.mock.calls[0]?.[0] as
      | { requestId: string; type: string }
      | undefined;
    expect(postedMessage?.type).toBe("CONVERT_OPENAPI");

    // Simulate the sandboxed page replying via postMessage to the parent window.
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          target: "offscreen",
          type: "SANDBOX_CONVERT_RESULT",
          requestId: postedMessage?.requestId,
          ok: true,
          data: { info: { name: "X" }, item: [] }
        }
      })
    );

    const response = (await responsePromise) as { ok: boolean; data?: { info?: unknown; item?: unknown[] } };
    expect(response.ok).toBe(true);
    expect(response.data?.info).toEqual({ name: "X" });
    expect(response.data?.item).toEqual([]);
  });

  it("ignores messages not targeted at the offscreen document", async () => {
    const listener = await importFreshOffscreenModule();

    let sendResponseCalled = false;
    const returnValue = listener(
      { target: "service-worker", type: "DETECT_SPEC", payload: { tabId: 1 } },
      {},
      () => {
        sendResponseCalled = true;
      }
    );

    expect(returnValue).toBe(false);
    expect(sendResponseCalled).toBe(false);
  });
});
