// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

async function importFreshSandboxModule(): Promise<void> {
  vi.resetModules();
  await import("../src/sandbox/sandbox.ts");
}

function waitForMessage(predicate: (data: unknown) => boolean, timeoutMs = 2000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("Timed out waiting for expected message"));
    }, timeoutMs);

    function onMessage(event: MessageEvent): void {
      if (!predicate(event.data)) return;
      clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve(event.data);
    }
    window.addEventListener("message", onMessage);
  });
}

describe("sandbox document CONVERT_OPENAPI handler", () => {
  it("converts a valid OpenAPI spec and posts a successful SANDBOX_CONVERT_RESULT back", async () => {
    await importFreshSandboxModule();

    // Match only the reply (type: SANDBOX_CONVERT_RESULT), not the request we
    // ourselves dispatch below (which shares the same requestId but is the
    // CONVERT_OPENAPI message, not a result).
    const resultPromise = waitForMessage(
      (data) =>
        !!data &&
        typeof data === "object" &&
        (data as { requestId?: unknown }).requestId === "req-1" &&
        (data as { type?: unknown }).type === "SANDBOX_CONVERT_RESULT"
    );

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          target: "sandbox",
          type: "CONVERT_OPENAPI",
          requestId: "req-1",
          specification: {
            openapi: "3.0.3",
            info: { title: "Sandbox Test API", version: "1.0.0" },
            servers: [{ url: "https://api.example.com" }],
            paths: {
              "/ping": { get: { operationId: "ping", responses: { "200": { description: "OK" } } } }
            }
          },
          settings: {
            folderStrategy: "Tags",
            parametersResolution: "Example",
            includeResponses: true,
            includeDeprecated: true,
            saveAs: false
          }
        }
      })
    );

    const result = (await resultPromise) as {
      target: string;
      type: string;
      ok: boolean;
      data?: { info?: unknown; item?: unknown[] };
    };

    expect(result.target).toBe("offscreen");
    expect(result.type).toBe("SANDBOX_CONVERT_RESULT");
    expect(result.ok).toBe(true);
    expect(result.data?.info).toBeDefined();
    expect(Array.isArray(result.data?.item)).toBe(true);
  });

  it("ignores messages not targeted at the sandbox document (produces no reply of its own)", async () => {
    await importFreshSandboxModule();

    // Count ALL messages seen (including the one we dispatch ourselves) so we
    // can detect whether sandbox.ts produced an extra reply message beyond it.
    let messageCount = 0;
    const onMessage = (): void => {
      messageCount += 1;
    };
    window.addEventListener("message", onMessage);

    window.dispatchEvent(new MessageEvent("message", { data: { target: "offscreen", type: "SOMETHING_ELSE" } }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    window.removeEventListener("message", onMessage);
    // Exactly 1: our own dispatched message, and nothing else from sandbox.ts.
    expect(messageCount).toBe(1);
  });
});
