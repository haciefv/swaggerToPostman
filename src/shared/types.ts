export type SpecSource = "swagger-ui" | "config-url" | "resource" | "fallback" | "manual";

export interface DetectedSpecification {
  source: SpecSource;
  name: string;
  url?: string;
  specification: Record<string, unknown>;
}

export interface SpecificationCandidate {
  name: string;
  url: string;
}

export interface SpecificationMetadata {
  title: string;
  apiVersion?: string;
  specificationVersion: string;
  endpointCount: number;
  tagCount: number;
  servers: string[];
  specUrl?: string;
}

export type FolderStrategy = "Tags" | "Paths";
export type ParametersResolution = "Example" | "Schema";

export interface ConversionSettings {
  folderStrategy: FolderStrategy;
  parametersResolution: ParametersResolution;
  includeResponses: boolean;
  includeDeprecated: boolean;
  saveAs: boolean;
}

export const DEFAULT_CONVERSION_SETTINGS: ConversionSettings = {
  folderStrategy: "Tags",
  parametersResolution: "Example",
  includeResponses: true,
  includeDeprecated: true,
  saveAs: false
};

export interface DetectionSuccess {
  status: "detected";
  detected: DetectedSpecification;
  metadata: SpecificationMetadata;
  alternatives: SpecificationCandidate[];
}

export interface DetectionNotFound {
  status: "not-found";
}

export interface DetectionError {
  status: "error";
  code: string;
  message: string;
  technicalDetails?: string;
}

export type DetectionResult = DetectionSuccess | DetectionNotFound | DetectionError;

export type PopupSettings = ConversionSettings;

/** Discriminated union describing every popup UI state. */
export type PopupState =
  | { kind: "loading" }
  | { kind: "detected"; detected: DetectedSpecification; metadata: SpecificationMetadata; alternatives: SpecificationCandidate[] }
  | { kind: "not-found" }
  | { kind: "converting" }
  | { kind: "error"; code: string; message: string; technicalDetails?: string };

export interface MessageRequestMap {
  DETECT_SPEC: { tabId: number };
  FETCH_SPEC_URL: { url: string; tabId: number };
  GET_SETTINGS: Record<string, never>;
  SAVE_SETTINGS: { settings: ConversionSettings };
  CONVERT_AND_DOWNLOAD: {
    detected: DetectedSpecification;
    metadata: SpecificationMetadata;
    settings: ConversionSettings;
    pageTitle?: string;
  };
  REQUEST_HOST_PERMISSION: { origin: string };
  /** Internal message: service worker -> offscreen document only. */
  CONVERT_OPENAPI: {
    specification: Record<string, unknown>;
    settings: ConversionSettings;
  };
}

export type MessageType = keyof MessageRequestMap;

/**
 * Every runtime message is explicitly targeted so the service worker never
 * responds to messages meant for the offscreen document and vice versa —
 * chrome.runtime messages are broadcast to every listening extension context.
 */
export type MessageTarget = "service-worker" | "offscreen";

export interface RuntimeMessage<T extends MessageType = MessageType> {
  target: MessageTarget;
  type: T;
  payload: MessageRequestMap[T];
}

export interface RuntimeResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; technicalDetails?: string };
}

export interface SecurityVariable {
  key: string;
  value: string;
  placeholderNote: string;
}
