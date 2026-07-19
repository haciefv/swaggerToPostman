import type { MessageRequestMap, MessageTarget, MessageType, RuntimeMessage, RuntimeResponse } from "./types";
import { messageFor, toAppError } from "./errors";

const MESSAGE_TIMEOUT_MS = 8000;

function timeoutResponse(technicalDetails: string): RuntimeResponse {
  return {
    ok: false,
    error: { code: "MESSAGE_TIMEOUT", message: messageFor("MESSAGE_TIMEOUT"), technicalDetails }
  };
}

/**
 * Sends a runtime message and always resolves (never rejects) with a RuntimeResponse,
 * so callers never need to wrap this in try/catch. Guards against three distinct
 * failure modes that can otherwise hang a caller forever: the promise never settling,
 * chrome.runtime.lastError being set without the promise rejecting, and the receiving
 * end not existing at all (service worker asleep/not yet registered, or the offscreen
 * document not yet created).
 *
 * `target` is mandatory because chrome.runtime messages are broadcast to every
 * listening extension context (popup, service worker, offscreen document) — without
 * it, the offscreen document's CONVERT_OPENAPI handler could pick up a popup message
 * meant for the service worker, or vice versa.
 */
export async function sendMessage<T extends MessageType>(
  target: MessageTarget,
  type: T,
  payload: MessageRequestMap[T]
): Promise<RuntimeResponse> {
  const message: RuntimeMessage<T> = { target, type, payload };

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<RuntimeResponse>((resolve) => {
    timeoutHandle = setTimeout(() => resolve(timeoutResponse("Timed out waiting for response")), MESSAGE_TIMEOUT_MS);
  });

  try {
    const response = await Promise.race([chrome.runtime.sendMessage(message) as Promise<RuntimeResponse>, timeoutPromise]);

    if (chrome.runtime.lastError) {
      return timeoutResponse(chrome.runtime.lastError.message ?? "chrome.runtime.lastError");
    }
    if (!response || typeof response !== "object") {
      return timeoutResponse("Empty or malformed response");
    }
    return response;
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    return timeoutResponse(details);
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}

type Handler<T extends MessageType> = (payload: MessageRequestMap[T]) => Promise<unknown>;

/**
 * Registers handlers scoped to a single MessageTarget. Messages addressed to a
 * different target are ignored entirely (no sendResponse call, listener returns
 * false) so the other context's own registerHandlers call can answer instead.
 */
export function registerHandlers(target: MessageTarget, handlers: { [K in MessageType]?: Handler<K> }): void {
  chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    if (message?.target !== target) return false;

    const handler = handlers[message.type];
    if (!handler) {
      sendResponse({ ok: false, error: toAppError(new Error(`No handler for message type: ${message.type}`)).toJSON() });
      return false;
    }

    (handler as Handler<MessageType>)(message.payload)
      .then((data) => {
        const response: RuntimeResponse = { ok: true, data };
        sendResponse(response);
      })
      .catch((error: unknown) => {
        const appError = toAppError(error);
        const response: RuntimeResponse = { ok: false, error: appError.toJSON() };
        sendResponse(response);
      });

    // Keep the message channel open until the async handler above calls sendResponse.
    return true;
  });
}
