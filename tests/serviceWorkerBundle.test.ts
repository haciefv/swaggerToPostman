import { beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execSync } from "node:child_process";

const ROOT = resolve(__dirname, "..");
const DIST_SERVICE_WORKER = resolve(ROOT, "dist", "service-worker.js");

/**
 * These two tests exercise the actual built artifact (dist/service-worker.js),
 * not the TypeScript source, because the bug this suite guards against
 * (openapi-to-postmanv2's transitive Node-builtin references crashing at
 * bundle-evaluation time) only exists after bundling. If dist/ hasn't been
 * built yet in this environment, build it once here.
 *
 * The file is imported in place (not copied elsewhere) because it shares a
 * code-split "assets/*.js" chunk with the popup bundle, referenced via a
 * "./assets/..." relative import — that resolution only works from its real
 * location inside dist/.
 */
beforeAll(() => {
  if (!existsSync(DIST_SERVICE_WORKER)) {
    execSync("npx vite build", { cwd: ROOT, stdio: "pipe", timeout: 120_000 });
  }
}, 130_000);

function minimalChromeStub() {
  return {
    runtime: {
      onMessage: { addListener: () => undefined },
      getURL: (path: string) => `chrome-extension://fake-id/${path}`,
      getContexts: async () => [],
      ContextType: { OFFSCREEN_DOCUMENT: "OFFSCREEN_DOCUMENT" }
    },
    offscreen: { Reason: { DOM_PARSER: "DOM_PARSER" }, createDocument: async () => undefined },
    storage: { sync: { get: async () => ({}), set: async () => undefined } },
    permissions: { contains: async () => false, request: async () => false },
    tabs: { get: async () => ({}), query: async () => [] },
    downloads: { download: async () => 1 },
    scripting: { executeScript: async () => [] }
  };
}

describe("built service worker bundle", () => {
  it("does not contain the openapi-to-postmanv2 package (only our own postman-collection.json filename string is allowed)", () => {
    const code = readFileSync(DIST_SERVICE_WORKER, "utf-8");
    expect(code).not.toContain("openapi-to-postmanv2");
    // Guard against the real npm package specifically, not our own
    // "${name}-postman-collection.json" filename template literal.
    expect(code).not.toMatch(/require\(["']postman-collection["']\)/);
  });

  it("loads without throwing at top-level module evaluation in a service-worker-like global scope", async () => {
    const previousSelf = (globalThis as { self?: unknown }).self;
    const previousChrome = (globalThis as { chrome?: unknown }).chrome;
    (globalThis as { self?: unknown }).self = globalThis;
    (globalThis as { chrome?: unknown }).chrome = minimalChromeStub();

    try {
      const url = `${pathToFileURL(DIST_SERVICE_WORKER).href}?bundle-load-test`;
      await expect(import(/* @vite-ignore */ url)).resolves.toBeDefined();
    } finally {
      (globalThis as { self?: unknown }).self = previousSelf;
      (globalThis as { chrome?: unknown }).chrome = previousChrome;
    }
  });
});
