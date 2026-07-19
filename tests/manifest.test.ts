import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadManifest(): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(__dirname, "..", "src", "manifest.json"), "utf-8"));
}

describe("manifest permissions", () => {
  it("does not declare 'permissions' as a named permission (it is not a valid Chrome permission)", () => {
    const manifest = loadManifest();
    const permissions = manifest["permissions"] as string[];
    expect(permissions).not.toContain("permissions");
  });

  it("declares 'offscreen' so chrome.offscreen.createDocument is available", () => {
    const manifest = loadManifest();
    const permissions = manifest["permissions"] as string[];
    expect(permissions).toContain("offscreen");
  });

  it("declares exactly the expected permission set", () => {
    const manifest = loadManifest();
    const permissions = manifest["permissions"] as string[];
    expect(permissions).toEqual(["activeTab", "scripting", "downloads", "storage", "offscreen"]);
  });

  it("keeps optional_host_permissions scoped to http/https only", () => {
    const manifest = loadManifest();
    expect(manifest["optional_host_permissions"]).toEqual(["http://*/*", "https://*/*"]);
  });
});

describe("manifest sandbox page", () => {
  it("declares sandbox.html as a sandboxed page", () => {
    const manifest = loadManifest();
    const sandbox = manifest["sandbox"] as { pages?: string[] };
    expect(sandbox?.pages).toEqual(["sandbox.html"]);
  });

  it("only grants 'unsafe-eval' to the sandbox CSP, never to extension_pages", () => {
    const manifest = loadManifest();
    const csp = manifest["content_security_policy"] as { extension_pages?: string; sandbox?: string };
    expect(csp.extension_pages).not.toMatch(/unsafe-eval/);
    expect(csp.sandbox).toMatch(/unsafe-eval/);
    expect(csp.sandbox).toMatch(/^sandbox /);
  });
});
