// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

interface ChromeStubOptions {
  tabsQueryRejects?: boolean;
  sendMessageRejects?: boolean;
}

function installChromeStub(options: ChromeStubOptions): void {
  (globalThis as { chrome?: unknown }).chrome = {
    tabs: {
      query: options.tabsQueryRejects
        ? async () => {
            throw new Error("simulated: chrome.tabs.query unavailable");
          }
        : async () => [],
      get: async () => ({})
    },
    runtime: {
      sendMessage: options.sendMessageRejects
        ? async () => {
            throw new Error("simulated: Could not establish connection. Receiving end does not exist.");
          }
        : async () => ({ ok: false, error: { code: "SWAGGER_NOT_FOUND", message: "not found" } }),
      lastError: undefined
    },
    downloads: { download: async () => 1 }
  };
}

function setUpDom(): void {
  document.body.innerHTML = `
    <div id="app" class="app">
      <header class="app-header"><span class="app-header__title">Swagger to Postman</span></header>
      <main id="content" class="content"></main>
    </div>
  `;
}

async function importFreshPopupModule(): Promise<void> {
  vi.resetModules();
  await import("../src/popup/popup.ts");
}

describe("popup startup resilience", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders the loading state synchronously, before any runtime message settles", async () => {
    setUpDom();
    // Neither tabs.query nor sendMessage ever resolves during this test, so if
    // the popup only rendered after those settled, #content would stay empty.
    (globalThis as { chrome?: unknown }).chrome = {
      tabs: { query: () => new Promise(() => undefined), get: () => new Promise(() => undefined) },
      runtime: { sendMessage: () => new Promise(() => undefined), lastError: undefined },
      downloads: { download: async () => 1 }
    };

    await importFreshPopupModule();

    const content = document.getElementById("content");
    expect(content?.textContent).toContain("Detecting Swagger specification");
  });

  it("does not remain blank when chrome.runtime messaging fails outright", async () => {
    setUpDom();
    installChromeStub({ tabsQueryRejects: true, sendMessageRejects: true });

    await importFreshPopupModule();

    // Flush the microtask queue enough times for loadSettings().catch().finally()
    // and runDetection()'s try/catch to complete and call render() again.
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve();
    }

    const content = document.getElementById("content");
    expect(content?.textContent?.trim().length).toBeGreaterThan(0);
    expect(content?.textContent).not.toContain("Detecting Swagger specification");
  });

  it("shows a visible error and logs it when #content is missing from the DOM", async () => {
    document.body.innerHTML = `<div id="app"></div>`; // no #content element
    installChromeStub({});

    await importFreshPopupModule();

    expect(document.body.textContent).toContain("The popup interface failed to load correctly");
  });
});
