# Swagger to Postman

A Manifest V3 Chrome extension that detects the Swagger/OpenAPI specification loaded on
the current tab and converts it into a Postman Collection in one click. The UI is in
English; the codebase is TypeScript, built with Vite.

## Features

- Automatic detection of Swagger 2.0, OpenAPI 3.0, and OpenAPI 3.1 specifications on any
  page, including authenticated Swagger UI pages (session cookies are sent automatically).
- One-click export to a Postman Collection, or download of the raw OpenAPI/Swagger file.
- Supports JSON and YAML specifications.
- Configurable folder structure (group by tags or by paths), request parameter source
  (example values or schema defaults), and inclusion of response examples / deprecated
  endpoints.
- Automatic `{{baseUrl}}` variable substitution and safe placeholder variables for
  detected authentication schemes — no real credentials are ever copied.
- Manual specification URL entry with on-demand host permission requests for
  cross-origin specs.

## Installation

```bash
npm install
```

## Development setup

```bash
npm run dev
```

This runs `vite build --watch`, rebuilding `dist/` on every source change. Reload the
unpacked extension in `chrome://extensions` after each rebuild (Chrome does not
hot-reload MV3 service workers or popups automatically).

## Production build

```bash
npm run build
```

Runs `tsc --noEmit` followed by `vite build`. Output is written to `dist/`.

```bash
npm run test        # Vitest unit tests
npm run typecheck   # tsc --noEmit only
```

## Loading the extension in Chrome

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `dist/` folder.
5. Pin the extension and open any Swagger UI page to try it.

## Supported Swagger/OpenAPI versions

- Swagger 2.0
- OpenAPI 3.0
- OpenAPI 3.1
- JSON and YAML specifications (YAML parsed with `js-yaml`)

Any other `swagger`/`openapi` version value is rejected with `UNSUPPORTED_SPEC_VERSION`.

## How automatic detection works

Detection runs in priority order, stopping at the first strategy that yields a valid
specification:

1. **Loaded Swagger UI state** — injects a function into the page's **MAIN** world and
   reads `window.ui.specSelectors.specJson()`, unwrapping Immutable.js results via
   `.toJS()` when present. No DOM scraping.
2. **Swagger UI config** — reads `window.ui.getConfigs()` for `url`, `urls` (multiple
   specs — surfaced in the popup as a selector), or an inline `spec`.
3. **Page resources** — inspects `performance.getEntriesByType("resource")` for
   same-origin URLs matching common spec patterns (`swagger.json`, `openapi.json`,
   `api-docs`, etc.).
4. **Common fallback endpoints** — tries a fixed list of same-origin paths such as
   `/v3/api-docs`, `/swagger/v1/swagger.json`.
5. **Manual URL** — the user pastes a spec URL directly into the popup.

Every candidate is fetched with `credentials: "include"` (so authenticated Swagger pages
work), validated as JSON or YAML, and checked for a `paths` object before being accepted.

## Architecture: service worker → offscreen document → sandboxed page

Conversion is split across three contexts, each solving a problem the
previous one can't:

1. **Service worker** (`src/background/service-worker.ts`) never imports
   `openapi-to-postmanv2`. That package's dependency graph (`iconv-lite`,
   `safer-buffer`, `swagger2openapi`, `oas-resolver`, ...) assumes a Node-like
   or full-DOM environment; when bundled for a plain service worker, one of
   those dependencies crashes at module-evaluation time (see "Known
   limitations"), which prevents the service worker from registering at all.
2. **Offscreen document** (`src/offscreen/offscreen.html` + `offscreen.ts`)
   runs in a real DOM/Window context. It does **not** import the converter
   either — it only hosts a hidden `<iframe>` pointing at the sandboxed page
   and relays messages between it and the service worker.
3. **Sandboxed page** (`src/sandbox/sandbox.html` + `sandbox.ts`, declared via
   manifest `sandbox.pages`) is the only place that imports
   `openapi-to-postmanv2`. `Converter.convert` calls `ajv.compile()`
   unconditionally on every conversion, and Ajv compiles validators via
   `new Function` — which violates the `'unsafe-eval'`-free CSP Chrome
   enforces on every normal extension page (offscreen documents included).
   There is no CSP setting that lifts this for a regular extension page.
   A sandboxed page is Chrome's documented exception: it runs in a unique,
   opaque origin with **no** access to `chrome.*` APIs, so its own CSP
   (`content_security_policy.sandbox`) is allowed to include `'unsafe-eval'`.

The flow for "Generate Postman Collection":

1. Popup sends `CONVERT_AND_DOWNLOAD` (`target: "service-worker"`) to the
   service worker.
2. The service worker calls `ensureOffscreenDocument()` — checks
   `chrome.runtime.getContexts()` for an existing offscreen document and
   creates one via `chrome.offscreen.createDocument()` if needed, guarded by
   a shared in-flight promise so concurrent calls don't race.
3. The service worker sends `CONVERT_OPENAPI` (`target: "offscreen"`) with
   the specification and settings.
4. The offscreen document creates (once) a hidden iframe loading
   `sandbox.html`, then `postMessage`s the request into it
   (`target: "sandbox"`).
5. The sandboxed page runs `Converter.convert` and `postMessage`s the raw
   collection back to its parent (`target: "offscreen"`,
   `type: "SANDBOX_CONVERT_RESULT"`).
6. The offscreen document resolves the pending `chrome.runtime` response with
   that collection.
7. The service worker validates the collection shape, normalizes it
   (`{{baseUrl}}` substitution, safe auth placeholders), sanitizes the JSON,
   and calls `chrome.downloads.download` — neither the offscreen document nor
   the sandboxed page ever touches `chrome.downloads`, and the sandboxed page
   never touches any `chrome.*` API at all (it can't — sandboxed pages don't
   have extension API access).

Every `chrome.runtime` message carries an explicit `target`
(`"service-worker"` or `"offscreen"`) because `chrome.runtime.sendMessage`
broadcasts to every listening extension context; each side's
`registerHandlers` call ignores messages addressed to the other target.
Similarly, every `postMessage` between the offscreen document and the
sandboxed iframe carries a `target` (`"sandbox"` or `"offscreen"`) plus a
`requestId` so replies can't be confused with requests or with messages from
an unrelated frame.

## Permissions explanation

| Permission | Why |
| --- | --- |
| `activeTab` | Read the current tab's URL/title and grant temporary same-origin fetch access when the user invokes the extension. |
| `scripting` | Inject the MAIN-world extraction function used by detection strategies 1–3. |
| `downloads` | Save the generated Postman Collection / raw OpenAPI file. |
| `storage` | Persist non-sensitive settings (`chrome.storage.sync`) — folder strategy, parameter resolution, response/deprecated toggles. |
| `offscreen` | Create the hidden offscreen document that hosts the sandboxed converter iframe (see "Architecture" below). |
| `optional_host_permissions` (`http://*/*`, `https://*/*`) | Only requested when the user explicitly loads a spec URL that is cross-origin relative to the active tab. Never granted upfront. `chrome.permissions.request`/`.contains` do not require a manifest permission named `"permissions"` — that string is not a valid Chrome permission at all. |

No permanent host permissions are declared in the manifest.

## Security approach

- Background message handlers (`src/background/service-worker.ts`) validate the URL
  protocol (`http`/`https` only) and origin before performing any privileged fetch, and
  require either same-tab-origin or an explicitly granted optional host permission —
  arbitrary pages cannot make the service worker fetch arbitrary URLs.
- The popup renders all untrusted content (titles, descriptions, URLs) via `textContent`,
  never `innerHTML`.
- No `eval`, `new Function`, or remotely-loaded JavaScript is used in *our* code.
  `openapi-to-postmanv2` itself uses Ajv internally (which compiles validators via
  `new Function`), so that package is confined to a dedicated **sandboxed page**
  (`src/sandbox/sandbox.ts`, manifest `sandbox.pages`) with no `chrome.*` API access
  and a unique opaque origin — the only extension surface allowed to declare
  `'unsafe-eval'` in its CSP. `Converter.convert` never executes descriptions/examples
  as arbitrary code; Ajv's compilation is schema-driven, not attacker-controlled string
  evaluation.
- Auth handling never copies a real credential from the page. `components.securitySchemes`
  / `securityDefinitions` are inspected only to decide which **empty placeholder**
  variables (`accessToken`, `apiKey`, `username`, `password`, `clientId`, `clientSecret`)
  to add to the generated collection.
- Settings persisted via `chrome.storage.sync` are limited to non-sensitive UI
  preferences; no tokens, cookies, or passwords are ever written to storage or logged.
- Generated collection JSON is sanitized (`sanitizeForJson`) to remove `undefined`,
  `NaN`, functions, and circular references before serialization.
- CSP: `script-src 'self'; object-src 'self'; style-src 'self'` for every normal
  extension page (`content_security_policy.extension_pages`) — no `'unsafe-eval'`
  anywhere in the popup, service worker, or offscreen document. Only
  `content_security_policy.sandbox` (applied solely to `sandbox.html`, which has no
  `chrome.*` access) includes `'unsafe-eval'`, and only because Ajv requires it.

## Troubleshooting

- **"No Swagger/OpenAPI specification was found on this page"** — the page may load its
  spec very late, behind a non-standard endpoint, or on a page Chrome restricts script
  injection on (e.g. `chrome://`, the Chrome Web Store). Use the manual URL field.
- **401/403 errors** — the session cookie for that origin isn't authenticated in this
  browser profile; log in to the Swagger page first, then click "Retry".
- **CORS / network errors fetching a manual URL** — if the URL is cross-origin from the
  active tab, the extension will prompt for optional host permission before retrying.
- **Popup shows stale data after logging in** — click "Retry" to re-run detection.

## Known limitations

- **Specs with non-JS-compatible `pattern` regexes are sanitized automatically.**
  Real-world OpenAPI documents exported from Java/Python tooling sometimes use
  regex syntax JS's `RegExp` rejects outright — most commonly a leading inline
  flag group like `(?i)` (PCRE/Python case-insensitive syntax; JS takes flags
  as `RegExp`'s second argument instead). `openapi-to-postmanv2` validates
  every `pattern` keyword via Ajv's `format: "regex"` check before conversion
  and fails the entire conversion (`"Provided API Specification is invalid"`)
  on the first one it can't parse. `sanitizeSchemaPatterns` in
  `src/postman/convertToPostman.ts` deep-clones the spec, strips a leading
  `(?i)`-style prefix from any pattern that needs it, and drops (rather than
  crashes on) any pattern it still can't make valid — so one bad regex in one
  schema property no longer blocks the whole collection from generating.
- **Root cause of a follow-up "'unsafe-eval' is not an allowed source of
  script" crash (fixed):** `openapi-to-postmanv2` calls `ajv.compile()`
  unconditionally on every `Converter.convert()`, and Ajv compiles validators
  via `new Function`, which every normal extension page's `'unsafe-eval'`-free
  CSP blocks (offscreen documents included — there is no CSP setting that
  lifts this for a regular extension page). Fixed by moving the converter into
  a dedicated **sandboxed page** (`src/sandbox/sandbox.ts`, manifest
  `sandbox.pages`) whose CSP is allowed to include `'unsafe-eval'` because it
  has no `chrome.*` API access. The offscreen document only hosts that page in
  a hidden iframe and relays `chrome.runtime` messages to/from it over
  `window.postMessage`.
- **Chain of Node-global polyfill gaps in the sandboxed bundle (fixed).**
  Moving the converter into its own bundle surfaced four more externalized
  Node built-ins that real specs actually exercise (not just theoretical),
  each root-caused by reproducing the exact reported error in an isolated
  realm (Node `vm.SourceTextModule`, browser-only globals, no ambient
  `Buffer`/`process`) and confirmed fixed the same way — full conversion of a
  real third-party OpenAPI document succeeding end-to-end with zero Node
  APIs present:
  - **`Buffer is not defined`** — `postman-collection/lib/util.js` calls bare
    global `Buffer.from(...)`/`Buffer.isBuffer(...)` without ever importing
    `"buffer"` itself, assuming Node's ambient global. Fixed by aliasing the
    `"buffer"` specifier to the [`buffer`](https://www.npmjs.com/package/buffer)
    npm polyfill in `vite.config.ts`, **and** attaching it to `globalThis` in
    `src/sandbox/globalShims.ts` for this exact bare-reference case (an
    import alias alone can't fix an unimported identifier).
  - **`crypto.createHash is not a function`** — `openapi-to-postmanv2/lib/schemaUtils.js`
    does `crypto = require('crypto')` then `crypto.createHash('sha1')` to
    cache faked schema examples; Vite externalizes Node's `crypto` module
    with no polyfill. Fixed with a minimal local shim
    (`src/shared/cryptoShim.ts`) exposing only `createHash`, backed by the
    lightweight [`create-hash`](https://www.npmjs.com/package/create-hash)
    package — deliberately *not* the full `crypto-browserify` bundle, which
    also polyfills unrelated asymmetric-crypto APIs never used here.
  - **`process is not defined`** — several packages in the dependency tree
    reference the bare `process` global (`process.cwd()`, `process.env`).
    Fixed the same way as `Buffer`: aliased to `process/browser` for proper
    imports, plus an inline minimal shim on `globalThis` in `globalShims.ts`
    for bare references.
  - **`Cannot read properties of undefined (reading 'call')`** —
    `create-hash`'s `cipher-base` dependency does
    `const Transform = require('stream').Transform` then
    `Transform.call(this, ...)` (classic pre-ES6 inheritance); with `"stream"`
    externalized and unpolyfilled, `Transform` is `undefined`. Fixed by
    aliasing `"stream"` to [`readable-stream`](https://www.npmjs.com/package/readable-stream)
    (the standard browser reimplementation of Node's stream module) and
    `"events"` to the [`events`](https://www.npmjs.com/package/events) package
    it in turn depends on.

  **Critical ordering detail:** the `Buffer`/`process` global shims live in
  their own zero-dependency module (`src/sandbox/globalShims.ts`), imported
  as the *first* statement in `sandbox.ts` — before `convertToPostman.ts`.
  ES module evaluation runs every imported module's top-level code before the
  importing module's own body, so if these assignments lived inline in
  `sandbox.ts` they would run *after* the converter's entire dependency tree
  had already evaluated (and already thrown on a bare `Buffer`/`process`
  reference at that tree's own module-evaluation time). Putting the shim in
  a separate, earlier-imported module — not inline — is what makes it run in
  time.
- The sandboxed page's bundle is large (~2.2 MB, ~745 KB gzipped) because the
  Postman converter, its schema-faking dependencies, and now these polyfills
  are bundled locally per the "no CDN" requirement. The service worker is
  ~56 KB and the offscreen document is ~1.5 KB — neither bundles the converter
  or any of its polyfills.
- Other Node built-ins (`fs`, `path`, `url`, `http`, `string_decoder`)
  referenced by the converter's dependency tree remain externalized (no
  polyfill) in the sandbox bundle. They are reached only behind
  `typeof x !== "undefined"` guards or code paths this extension never
  exercises (in-memory JSON/YAML conversion, no external `$ref` file
  resolution, no outbound HTTP from the converter itself) — verified by
  actually invoking the built sandbox bundle's conversion handler, end to end,
  against a real third-party OpenAPI document in a simulated browser-global
  environment. If a future spec triggers one of those unexercised paths,
  apply the same "reproduce in an isolated realm, identify the exact
  dependency, polyfill only that" approach used for `buffer`/`crypto`/`process`/`stream`.
- Detection strategy 3 (page resource inspection) only sees resources Chrome has already
  recorded in the Performance API for the current page load; a hard refresh may be
  required after the Swagger page finishes loading its spec.

## Localization

All popup UI strings live in `src/i18n/`. `en.ts` defines the string shape (`Locale`) and
the English translations; `index.ts` resolves the active locale. Adding a new language
requires only a new `<code>.ts` file matching the `Locale` shape and one line registering
it in `index.ts` — no changes to `popup.ts` itself.

## Contributing

1. Fork the repository and create a feature branch.
2. Run `npm install`, then `npm run typecheck`, `npm run test`, and `npm run build`
   before opening a pull request — all three must pass.
3. Keep changes focused; avoid unrelated formatting or refactoring in the same PR.
4. Describe the change and, for behavioral changes, how you verified it (unit tests,
   manual testing steps, or both).

## Privacy

This extension processes Swagger/OpenAPI specification content locally in the browser
and does not transmit it to the developer or any external server. See
[`./PRIVACY.md`](./PRIVACY.md) for the full privacy policy.

## License

No license file is currently included; treat this repository as All Rights Reserved
until a `LICENSE` file is added.

## Chrome Web Store preparation checklist

- [ ] Bump `version` in `src/manifest.json` and keep it in sync with `package.json`.
- [ ] Replace the placeholder icons in `icons/` with final branded artwork (16/48/128 px).
- [ ] Write a Store listing description and at least one screenshot of the popup states.
- [ ] Confirm `npm run build && npm run test && npm run typecheck` all pass.
- [ ] Zip the contents of `dist/` (not the folder itself) for upload.
- [ ] Re-review `optional_host_permissions` justification text for the Store listing —
      explain that it is requested only for user-initiated cross-origin manual URLs.
- [ ] Verify the privacy practices form matches this README's Security approach section
      (no data collection, no remote code, no credential storage).
