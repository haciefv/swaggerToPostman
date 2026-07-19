import { Buffer } from "buffer";

/**
 * Must be imported FIRST in sandbox.ts, before convertToPostman.ts (and
 * therefore before openapi-to-postmanv2's entire dependency tree). ES module
 * evaluation order runs every imported module's top-level code before the
 * importing module's own body — so if these assignments lived inline in
 * sandbox.ts, they would run too late: some vendor module deep in that tree
 * references the bare `Buffer`/`process` globals at ITS OWN top-level scope,
 * which executes before sandbox.ts's own body ever gets a chance to run.
 * This file has no heavy imports of its own, so it fully evaluates (setting
 * the globals) before the converter's dependency graph is even reached.
 *
 * postman-collection calls bare global `Buffer.from(...)` / `Buffer.isBuffer(...)`
 * (e.g. lib/util.js) without ever importing "buffer" itself, assuming Node's
 * ambient global — throwing "ReferenceError: Buffer is not defined" in any
 * browser context. Several other packages in the tree similarly reference
 * the bare `process` global (`process.cwd()`, `process.env`, etc.).
 * vite.config.ts's `resolve.alias` rewrites `import ... from "buffer"`/`"process"`
 * specifiers for code that imports them properly, but can't fix a bare,
 * unimported identifier reference — that needs an actual global.
 */
if (typeof (globalThis as { Buffer?: unknown }).Buffer === "undefined") {
  (globalThis as { Buffer?: unknown }).Buffer = Buffer;
}

if (typeof (globalThis as { process?: unknown }).process === "undefined") {
  (globalThis as { process?: unknown }).process = {
    browser: true,
    env: {},
    argv: [],
    version: "",
    versions: {},
    cwd: () => "/",
    nextTick: (fn: (...args: unknown[]) => void, ...args: unknown[]) => setTimeout(() => fn(...args), 0)
  };
}
