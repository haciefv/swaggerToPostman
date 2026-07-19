import "./globalShims";
import { convertSpecificationToPostman } from "../postman/convertToPostman";
import { toAppError } from "../shared/errors";
import type { ConversionSettings } from "../shared/types";

/**
 * This is the ONLY place in the extension that imports openapi-to-postmanv2.
 * openapi-to-postmanv2 calls `ajv.compile()` unconditionally on every
 * conversion (not only when schemaFaker is enabled), and Ajv compiles
 * validators via `new Function`. Chrome hard-blocks 'unsafe-eval' for normal
 * extension pages (offscreen documents included) — there is no CSP setting
 * that lifts this for a regular extension page. A sandboxed page
 * (manifest "sandbox.pages") is the documented exception: it runs in a
 * unique, opaque origin with no access to chrome.* APIs, so its own CSP is
 * allowed to include 'unsafe-eval'. The offscreen document embeds this page
 * in a hidden iframe and talks to it over window.postMessage; only the
 * offscreen document talks to the service worker over chrome.runtime
 * messaging, so this page never touches chrome.* at all.
 */

interface SandboxConvertRequest {
  target: "sandbox";
  type: "CONVERT_OPENAPI";
  requestId: string;
  specification: Record<string, unknown>;
  settings: ConversionSettings;
}

function isSandboxConvertRequest(data: unknown): data is SandboxConvertRequest {
  return (
    !!data &&
    typeof data === "object" &&
    (data as { target?: unknown }).target === "sandbox" &&
    (data as { type?: unknown }).type === "CONVERT_OPENAPI"
  );
}

window.addEventListener("message", (event: MessageEvent) => {
  const data: unknown = event.data;
  if (!isSandboxConvertRequest(data)) return;

  const { requestId, specification, settings } = data;
  const reply = (payload: Record<string, unknown>): void => {
    const target = window.parent !== window ? window.parent : window;
    target.postMessage({ target: "offscreen", type: "SANDBOX_CONVERT_RESULT", requestId, ...payload }, "*");
  };

  convertSpecificationToPostman({ type: "json", data: specification }, settings)
    .then((collection) => reply({ ok: true, data: collection }))
    .catch((error: unknown) => reply({ ok: false, error: toAppError(error).toJSON() }));
});
