# Chrome Web Store Listing

## Extension Name

Swagger to Postman

## Short Description (max 132 characters)

Generate Postman Collections directly from authenticated Swagger and OpenAPI pages.

(131 characters)

## Full Description

**Swagger to Postman** turns any Swagger or OpenAPI page you're already looking at into a
ready-to-use Postman Collection — no copy-pasting specs, no manual auth setup.

**Works where you're already logged in**
Point it at an authenticated internal Swagger UI page and it detects the loaded
specification using your existing session, so private and staging APIs convert just as
easily as public ones.

**Broad format support**
- Swagger 2.0
- OpenAPI 3.0
- OpenAPI 3.1
- JSON and YAML specifications

**One-click export**
Click the extension icon, review the detected API's name, version, endpoint count, and
server URL, then generate a Postman Collection or download the raw specification file —
both in a single click.

**Automatic variables**
Server URLs are converted into a `{{baseUrl}}` collection variable, and detected
authentication schemes get safe, empty placeholder variables (`accessToken`, `apiKey`,
`username`, `password`, `clientId`, `clientSecret`) added automatically — never real
credentials copied from the page.

**Tag grouping**
Choose whether the generated collection's folders are organized by OpenAPI tags or by
URL paths, and whether request parameters are pre-filled from examples or schema
defaults.

**Browser-safe conversion**
All conversion runs locally inside the browser, isolated in a sandboxed page with no
access to your browsing data or the extension's own APIs — nothing is ever uploaded to
a remote server.

## Privacy Practices Description

Swagger to Postman is built to keep your API data on your machine:

- **No API data is uploaded anywhere.** Detected specifications and generated
  collections never leave the browser.
- **Conversion happens locally.** The Swagger/OpenAPI-to-Postman conversion runs
  entirely inside an isolated, sandboxed page within the extension — no external
  servers are involved.
- **No authentication tokens are stored.** The extension reads your existing browser
  session to fetch specifications from authenticated pages, but never persists,
  transmits, or logs cookies, tokens, or passwords. Generated collections only ever
  contain empty placeholder variables for auth fields.
- **No tracking.** The extension does not track your browsing activity or usage
  patterns.
- **No analytics.** No telemetry, crash reporting, or third-party analytics SDKs are
  included.

The only data persisted by the extension is your own UI preferences (folder structure,
parameter source, response/deprecated-endpoint toggles), stored via `chrome.storage.sync`
and never transmitted anywhere outside your own Chrome sync account.
