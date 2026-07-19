# Privacy Policy

**Last updated: July 19, 2026**

## Overview

Swagger to Postman ("the extension") is a Chrome extension that detects Swagger and
OpenAPI specifications on the web page you are currently viewing and converts them into
a Postman Collection. This document explains what data the extension processes, how it
is used, and what happens to it.

Repository: https://github.com/haciefv/swaggerToPostman

## Information We Collect

The extension does not collect, transmit, or sell any information to its developer or to
any third party. It has no backend server, no analytics endpoint, and no remote logging
of any kind. Everything described below happens locally, inside your browser.

## Website Content

To provide its core functionality, the extension reads the Swagger/OpenAPI specification
content available on the active tab (for example, the specification loaded by a Swagger
UI page, or a specification URL you select or paste manually) and, where relevant, page
metadata such as the tab title and specification URLs referenced by the page. This
access only occurs when you open the extension's popup or explicitly trigger an action
(such as loading a manual URL). This data is used solely to detect, validate, and convert
the specification, and is not transmitted to the developer or to any external server.

## Local Processing

All parsing, validation, and conversion of Swagger/OpenAPI specifications into Postman
Collections is performed locally inside the browser, using JavaScript bundled with the
extension. No specification content, generated collection, or page data is ever uploaded
to a remote server. The conversion logic runs in an isolated, sandboxed extension page
with no network access and no access to Chrome extension APIs.

## Authentication and Credentials

When fetching a specification from an authenticated page, the extension relies on your
browser's existing session (cookies) for that origin, in the same way any page you visit
would. The extension does not intentionally read, copy, store, or transmit authentication
tokens, cookies, passwords, API keys, or other credentials found on the page.

When a specification declares authentication schemes (for example, bearer tokens, API
keys, or basic auth), the extension adds empty placeholder variables to the generated
Postman Collection (such as `accessToken`, `apiKey`, `username`, `password`, `clientId`,
`clientSecret`) so you can fill in real values yourself in Postman. These placeholder
values are always empty strings — no real credential is ever copied from the page into
the generated collection.

## Local Storage

The extension stores your conversion preferences (folder structure, parameter source,
and toggles for including response examples or deprecated endpoints) using Chrome's
`chrome.storage.sync` API. This data contains only UI preferences — never specification
content, credentials, or personally identifiable information — and is synced by Chrome
across your own signed-in browser profiles, not sent to the developer. This data remains
in `chrome.storage` until you clear the extension's storage or uninstall the extension.

## Data Sharing

The extension does not share, sell, rent, or otherwise transfer any data to third
parties. It has no server component to send data to in the first place.

## Analytics and Tracking

The extension does not use analytics, telemetry, crash reporting, or any third-party
tracking SDK. It does not track your browsing activity, browsing history, or usage
patterns, and it does not display advertisements.

## Remote Code

All JavaScript executed by the extension, including the OpenAPI-to-Postman conversion
library and its dependencies, is bundled with the extension package at build time. The
extension does not fetch, load, or execute any remotely hosted script or code.

## Data Retention

Because the extension does not transmit data anywhere, there is no server-side retention
of any kind. Locally, specification data detected during a session exists only in memory
for the duration of that popup session and is discarded when the popup closes. The only
persisted data is the local preferences described in "Local Storage" above, which remain
until you clear them or uninstall the extension.

## Security

The extension validates URL protocols and origins before performing any network request,
restricts privileged actions (such as fetching a cross-origin specification URL) to
same-tab-origin requests or origins you have explicitly granted permission to, and
renders all page-derived text (titles, descriptions, URLs) as plain text rather than
HTML to avoid script injection. The specification conversion library runs in a sandboxed
page with no access to Chrome extension APIs or the network.

## Children's Privacy

The extension is a developer tool intended for use by software developers and API
consumers. It is not directed at children under 13, and it does not knowingly collect
any personal information from anyone, including children.

## Changes to This Privacy Policy

If this policy is updated, the revised version will be published in this file in the
extension's repository, with an updated "Last updated" date at the top. Continued use of
the extension after a change constitutes acceptance of the revised policy.

## Contact

If you have questions about this privacy policy, contact: [CONTACT_EMAIL]
