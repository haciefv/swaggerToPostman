import { registerHandlers } from "../shared/messages";
import { AppError, toAppError } from "../shared/errors";
import type { ErrorCode } from "../shared/errors";
import type { ConversionSettings } from "../shared/types";

/**
 * This document never imports openapi-to-postmanv2 directly. That package's
 * ajv.compile() call (run unconditionally on every conversion) uses
 * `new Function`, which violates the 'unsafe-eval'-free CSP Chrome enforces
 * for every normal extension page, offscreen documents included — there is
 * no CSP setting that lifts this. Instead, the actual conversion runs inside
 * a sandboxed iframe (src/sandbox/sandbox.ts, manifest "sandbox.pages"),
 * which Chrome allows to declare 'unsafe-eval' precisely because it runs in
 * a unique opaque origin with no chrome.* API access. This document's only
 * job is to host that iframe and relay window.postMessage <-> chrome.runtime
 * messaging. It never calls chrome.downloads — only the service worker does.
 */

const SANDBOX_MESSAGE_TIMEOUT_MS = 15_000;

let sandboxFrame: HTMLIFrameElement | null = null;
let sandboxReady: Promise<HTMLIFrameElement> | null = null;

function createSandboxFrame(): Promise<HTMLIFrameElement> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.style.display = "none";
    frame.addEventListener("load", () => resolve(frame), { once: true });
    frame.addEventListener("error", () => reject(new AppError("OFFSCREEN_CREATE_FAILED", "Sandbox iframe failed to load")), {
      once: true
    });
    frame.src = chrome.runtime.getURL("sandbox.html");
    document.body.appendChild(frame);
  });
}

function ensureSandboxFrame(): Promise<HTMLIFrameElement> {
  if (!sandboxReady) {
    sandboxReady = createSandboxFrame().then((frame) => {
      sandboxFrame = frame;
      return frame;
    });
  }
  return sandboxReady;
}

let requestCounter = 0;

interface SandboxResultMessage {
  target: "offscreen";
  type: "SANDBOX_CONVERT_RESULT";
  requestId: string;
  ok: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string; technicalDetails?: string };
}

function isSandboxResultMessage(data: unknown): data is SandboxResultMessage {
  return (
    !!data &&
    typeof data === "object" &&
    (data as { target?: unknown }).target === "offscreen" &&
    (data as { type?: unknown }).type === "SANDBOX_CONVERT_RESULT"
  );
}

async function convertViaSandbox(
  specification: Record<string, unknown>,
  settings: ConversionSettings
): Promise<Record<string, unknown>> {
  const frame = await ensureSandboxFrame();
  const contentWindow = frame.contentWindow;
  if (!contentWindow) {
    throw new AppError("CONVERTER_RUNTIME_INCOMPATIBLE", "Sandbox iframe has no contentWindow");
  }

  requestCounter += 1;
  const requestId = `sandbox-${Date.now()}-${requestCounter}`;

  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new AppError("CONVERTER_RUNTIME_INCOMPATIBLE", "Sandbox conversion timed out"));
    }, SANDBOX_MESSAGE_TIMEOUT_MS);

    function onMessage(event: MessageEvent): void {
      const data: unknown = event.data;
      if (!isSandboxResultMessage(data) || data.requestId !== requestId) return;
      clearTimeout(timeout);
      window.removeEventListener("message", onMessage);

      if (data.ok && data.data) {
        resolve(data.data);
      } else {
        reject(new AppError((data.error?.code as ErrorCode) ?? "OFFSCREEN_CONVERSION_FAILED", data.error?.technicalDetails));
      }
    }

    window.addEventListener("message", onMessage);
    contentWindow.postMessage({ target: "sandbox", type: "CONVERT_OPENAPI", requestId, specification, settings }, "*");
  }).catch((error: unknown) => {
    throw toAppError(error, "OFFSCREEN_CONVERSION_FAILED");
  });
}

registerHandlers("offscreen", {
  CONVERT_OPENAPI: async ({ specification, settings }) => convertViaSandbox(specification, settings)
});
