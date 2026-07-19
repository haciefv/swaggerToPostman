import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const REPO_ROOT = resolve(__dirname, "..");
const SRC_ROOT = resolve(REPO_ROOT, "src");
const DIST_ROOT = resolve(REPO_ROOT, "dist");

/** Recursively collects every file under `dir`, skipping node_modules. */
function collectFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...collectFiles(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

function loadManifest(): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(SRC_ROOT, "manifest.json"), "utf-8"));
}

describe("uninstall redirect", () => {
  it("does not declare an 'uninstall_url' field in the manifest", () => {
    const manifest = loadManifest();
    expect(manifest["uninstall_url"]).toBeUndefined();
  });

  it("never calls chrome.runtime.setUninstallURL anywhere in the source", () => {
    const files = collectFiles(SRC_ROOT).filter((f) => /\.(ts|tsx|js|html)$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      expect(source).not.toMatch(/setUninstallURL/i);
    }
  });

  it("never references an unrelated redirect target (e.g. Coparta) anywhere in the source", () => {
    const files = collectFiles(SRC_ROOT).filter((f) => /\.(ts|tsx|js|html|json)$/.test(f));
    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      expect(source).not.toMatch(/coparta/i);
    }
  });

  it("keeps the production build free of setUninstallURL and Coparta references, if a build exists", () => {
    const files = collectFiles(DIST_ROOT).filter((f) => /\.(js|html|json)$/.test(f));
    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      expect(source).not.toMatch(/setUninstallURL/i);
      expect(source).not.toMatch(/coparta/i);
    }
  });
});
