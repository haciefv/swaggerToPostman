import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SRC_ROOT = resolve(__dirname, "..", "src");
const FORBIDDEN_PACKAGES = ["openapi-to-postmanv2", "postman-collection", "swagger2openapi"];
const IMPORT_PATTERN = /(?:import|export)\s+(?:[^;]*?\s+from\s+)?["']([^"']+)["']/g;

function resolveLocalImport(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Walks the local (non-node_modules) static import graph reachable from an entry file. */
function collectImportGraph(entryFile: string): { localFiles: Set<string>; externalSpecifiers: Set<string> } {
  const localFiles = new Set<string>();
  const externalSpecifiers = new Set<string>();
  const queue = [entryFile];

  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || localFiles.has(file)) continue;
    localFiles.add(file);

    const source = readFileSync(file, "utf-8");
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const specifier = match[1];
      if (!specifier) continue;
      const localPath = resolveLocalImport(file, specifier);
      if (localPath) {
        queue.push(localPath);
      } else if (!specifier.startsWith(".")) {
        externalSpecifiers.add(specifier);
      }
    }
  }

  return { localFiles, externalSpecifiers };
}

describe("service worker static import graph", () => {
  const entry = resolve(SRC_ROOT, "background", "service-worker.ts");
  const { localFiles, externalSpecifiers } = collectImportGraph(entry);

  it("never statically imports the Postman converter package or its heavy dependents", () => {
    for (const forbidden of FORBIDDEN_PACKAGES) {
      expect(externalSpecifiers.has(forbidden)).toBe(false);
    }
  });

  it("does not reach postman/convertToPostman.ts (the only file allowed to import the converter)", () => {
    const convertModule = resolve(SRC_ROOT, "postman", "convertToPostman.ts");
    expect(localFiles.has(convertModule)).toBe(false);
  });

  it("does reach the offscreen-orchestration pieces it is expected to use (sanity check on the graph walk itself)", () => {
    expect(localFiles.has(resolve(SRC_ROOT, "shared", "messages.ts"))).toBe(true);
    expect(localFiles.has(resolve(SRC_ROOT, "swagger", "detectSwagger.ts"))).toBe(true);
  });
});

describe("offscreen document static import graph", () => {
  const entry = resolve(SRC_ROOT, "offscreen", "offscreen.ts");
  const { localFiles, externalSpecifiers } = collectImportGraph(entry);

  it("does not import openapi-to-postmanv2 or reach postman/convertToPostman.ts (conversion runs in the sandboxed page)", () => {
    for (const forbidden of FORBIDDEN_PACKAGES) {
      expect(externalSpecifiers.has(forbidden)).toBe(false);
    }
    const convertModule = resolve(SRC_ROOT, "postman", "convertToPostman.ts");
    expect(localFiles.has(convertModule)).toBe(false);
  });

  it("never calls chrome.downloads (only the service worker downloads files)", () => {
    const source = readFileSync(entry, "utf-8");
    // Match an actual API call, not the explanatory comment mentioning chrome.downloads.
    expect(source).not.toMatch(/chrome\.downloads\s*\.\s*download\s*\(/);
  });
});

describe("sandbox document static import graph", () => {
  const entry = resolve(SRC_ROOT, "sandbox", "sandbox.ts");
  const { localFiles } = collectImportGraph(entry);

  it("is the only file that imports postman/convertToPostman.ts", () => {
    const convertModule = resolve(SRC_ROOT, "postman", "convertToPostman.ts");
    expect(localFiles.has(convertModule)).toBe(true);
  });

  it("never calls any chrome.* API (sandboxed pages have no extension API access)", () => {
    const source = readFileSync(entry, "utf-8");
    // Match an actual API call/property access, not comment prose about chrome.* APIs.
    expect(source).not.toMatch(/\bchrome\.\w+\.\w+/);
  });
});
