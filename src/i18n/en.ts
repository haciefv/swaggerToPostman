/**
 * English UI strings for the popup. Structured as one flat object so a new
 * locale (fr.ts, de.ts, es.ts, ...) only needs to satisfy the same shape.
 */
export const en = {
  popup: {
    detectingSpec: "Detecting Swagger specification...",
    convertingSpec: "Generating Postman Collection...",
    notFound: "No Swagger/OpenAPI specification was found on this page.",
    unknownError: "Unknown error",
    contentMissing: "The popup interface failed to load correctly. Please reload the extension.",
    unexpectedDetectionError: "An unexpected error occurred while detecting the specification.",
    unexpectedStartupError: "An unexpected error occurred while starting the extension."
  },
  metadata: {
    apiName: "API Name",
    apiVersion: "API Version",
    specVersion: "Specification Version",
    endpointCount: "Endpoints",
    tagCount: "Tags",
    specUrl: "Specification URL",
    serverUrl: "Server URL"
  },
  actions: {
    selectApi: "Select API",
    generateCollection: "Generate Postman Collection",
    downloadOpenApi: "Download OpenAPI Specification",
    copySpecUrl: "Copy Specification URL",
    retry: "Retry",
    openApiUrl: "OpenAPI URL",
    loadFromUrl: "Load from URL",
    openApiUrlPlaceholder: "https://api.example.com/openapi.json"
  },
  settings: {
    title: "Settings",
    folderStructure: "Folder Structure",
    folderStrategyTags: "Group by Tags",
    folderStrategyPaths: "Group by Paths",
    parametersSource: "Request Parameter Source",
    includeResponses: "Include Response Examples",
    includeDeprecated: "Include Deprecated Endpoints",
    askFilenameBeforeDownload: "Ask for filename before download"
  },
  errorBox: {
    technicalDetails: "Technical Details"
  },
  toasts: {
    collectionDownloaded: "Postman Collection downloaded.",
    openApiDownloaded: "OpenAPI specification downloaded.",
    specUrlCopied: "Specification URL copied.",
    specUrlUnavailable: "Specification URL is unavailable."
  }
} as const;

export type Locale = typeof en;
