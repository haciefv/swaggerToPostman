import createHash from "create-hash";

/**
 * Minimal browser-compatible stand-in for Node's `crypto` module, aliased in
 * vite.config.ts. openapi-to-postmanv2 (lib/schemaUtils.js) does
 * `crypto = require('crypto')` and then calls `crypto.createHash('sha1')...`
 * to build a cache key while faking example data from JSON Schemas. Vite
 * externalizes the real Node `crypto` built-in for browser bundles with no
 * polyfill, leaving `crypto.createHash` undefined
 * ("TypeError: crypto.createHash is not a function"). Rather than pull in
 * the full `crypto-browserify` package (which also polyfills unrelated
 * asymmetric-crypto APIs — Diffie-Hellman, public/private key signing —
 * never exercised by this extension), this shim exposes only the one
 * function actually called: `createHash`, backed by the lightweight
 * `create-hash` package.
 */
export { createHash };
