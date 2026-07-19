import { defineConfig } from "vite";
import { resolve } from "node:path";
import {
  readdirSync,
  copyFileSync,
  mkdirSync,
  existsSync,
  rmdirSync,
  statSync,
  readFileSync,
  writeFileSync,
  unlinkSync
} from "node:fs";

const iconsPlugin = () => ({
  name: "copy-icons-and-manifest",
  closeBundle() {
    const outDir = resolve(__dirname, "dist");
    const iconsOut = resolve(outDir, "icons");
    if (!existsSync(iconsOut)) mkdirSync(iconsOut, { recursive: true });
    const iconsSrc = resolve(__dirname, "icons");
    if (existsSync(iconsSrc)) {
      for (const file of readdirSync(iconsSrc)) {
        copyFileSync(resolve(iconsSrc, file), resolve(iconsOut, file));
      }
    }
    copyFileSync(resolve(__dirname, "src/manifest.json"), resolve(outDir, "manifest.json"));
  }
});

/**
 * Vite writes HTML entry outputs to disk at a path mirroring their source
 * location relative to project root (e.g. "dist/src/popup/popup.html"), with
 * asset references rewritten relative to that nested location (e.g.
 * "../../assets/popup-x.js"). The manifest and
 * chrome.offscreen.createDocument() call reference flat paths ("popup.html",
 * "offscreen.html"), so move every emitted HTML file to the dist root after
 * the write phase, rewriting its "../../" relative asset prefixes back to
 * dist-root-relative paths, and prune the now-empty src/ subtree.
 */
const flattenHtmlOutputs = () => ({
  name: "flatten-html-outputs",
  closeBundle() {
    const outDir = resolve(__dirname, "dist");
    const nestedSrc = resolve(outDir, "src");
    if (!existsSync(nestedSrc)) return;

    const moveHtmlFiles = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const entryPath = resolve(dir, entry);
        if (statSync(entryPath).isDirectory()) {
          moveHtmlFiles(entryPath);
        } else if (entry.endsWith(".html")) {
          const html = readFileSync(entryPath, "utf-8").replace(/\.\.\/\.\.\//g, "");
          writeFileSync(resolve(outDir, entry), html, "utf-8");
          unlinkSync(entryPath);
        }
      }
    };
    moveHtmlFiles(nestedSrc);

    const removeEmptyDirs = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const entryPath = resolve(dir, entry);
        if (statSync(entryPath).isDirectory()) removeEmptyDirs(entryPath);
      }
      if (readdirSync(dir).length === 0) rmdirSync(dir);
    };
    removeEmptyDirs(nestedSrc);
  }
});

export default defineConfig({
  root: ".",
  base: "./",
  resolve: {
    alias: {
      // openapi-to-postmanv2 -> iconv-lite -> safer-buffer does
      // `require('buffer').Buffer` and assigns `.prototype` off it at module
      // scope. Vite externalizes Node's core "buffer" module for browser
      // builds without a polyfill, so that resolves to an empty stub and the
      // assignment throws "Cannot read properties of undefined (reading
      // 'prototype')" the instant the sandbox document's script evaluates.
      // The "buffer" npm package is the minimal, purpose-built browser
      // polyfill for exactly this Buffer API surface.
      buffer: "buffer",
      // openapi-to-postmanv2 (lib/schemaUtils.js) does `crypto =
      // require('crypto')` and calls `crypto.createHash('sha1')...` while
      // faking example data from JSON Schemas. Same externalization problem
      // as "buffer" above. Rather than alias to the full crypto-browserify
      // package (which also polyfills unrelated asymmetric-crypto APIs never
      // used here), point at a minimal local shim exposing only createHash.
      crypto: resolve(__dirname, "src/shared/cryptoShim.ts"),
      // Several packages deep in openapi-to-postmanv2's dependency tree
      // (e.g. the bundled "path" polyfill's resolve() fallback, and various
      // UMD-style environment checks) reference the bare `process` global
      // (`process.cwd()`, `process.env`, etc.) assuming a Node-like host.
      // Browsers — including this extension's sandboxed page — never define
      // it. `process/browser` is the standard, dependency-free minimal shim
      // long used by bundlers for exactly this gap.
      process: "process/browser",
      // create-hash's cipher-base dependency does
      // `const Transform = require('stream').Transform` then
      // `Transform.call(this, ...)` in its constructor (classic pre-ES6
      // inheritance). With "stream" externalized and unpolyfilled, that's
      // "Cannot read properties of undefined (reading 'call')". "readable-stream"
      // is the standard, widely-used browser-compatible reimplementation of
      // Node's stream module (already a transitive dependency here).
      stream: "readable-stream",
      // readable-stream itself requires "events" (for its internal
      // EventEmitter base class); same externalization gap, same fix.
      events: "events"
    }
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/popup.html"),
        offscreen: resolve(__dirname, "src/offscreen/offscreen.html"),
        sandbox: resolve(__dirname, "src/sandbox/sandbox.html"),
        "service-worker": resolve(__dirname, "src/background/service-worker.ts")
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "service-worker" ? "service-worker.js" : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  },
  // flattenHtmlOutputs must run before iconsPlugin's manifest copy only in the
  // sense that both are closeBundle hooks with no ordering dependency between
  // them; order here doesn't matter, but flatten runs first as written.
  plugins: [flattenHtmlOutputs(), iconsPlugin()]
});
