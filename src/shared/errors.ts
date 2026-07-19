export type ErrorCode =
  | "SWAGGER_NOT_FOUND"
  | "SPEC_FETCH_FAILED"
  | "SPEC_UNAUTHORIZED"
  | "SPEC_FORBIDDEN"
  | "INVALID_SPEC"
  | "UNSUPPORTED_SPEC_VERSION"
  | "CONVERSION_FAILED"
  | "DOWNLOAD_FAILED"
  | "HOST_PERMISSION_DENIED"
  | "MESSAGE_TIMEOUT"
  | "OFFSCREEN_CREATE_FAILED"
  | "OFFSCREEN_CONVERSION_FAILED"
  | "CONVERTER_RUNTIME_INCOMPATIBLE";

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  SWAGGER_NOT_FOUND: "No Swagger/OpenAPI specification was found on this page.",
  SPEC_FETCH_FAILED: "Failed to fetch the specification. Check your network connection.",
  SPEC_UNAUTHORIZED: "You are not authorized to access this specification (401). Please log in.",
  SPEC_FORBIDDEN: "Access to this specification is forbidden (403).",
  INVALID_SPEC: "The file found is not valid JSON or YAML.",
  UNSUPPORTED_SPEC_VERSION: "This Swagger/OpenAPI version is not supported.",
  CONVERSION_FAILED: "Failed to generate the Postman Collection.",
  DOWNLOAD_FAILED: "Failed to download the file.",
  HOST_PERMISSION_DENIED: "Permission to access this host was denied.",
  MESSAGE_TIMEOUT: "The operation timed out. Please try again.",
  OFFSCREEN_CREATE_FAILED: "Failed to initialize the offscreen document required for conversion.",
  OFFSCREEN_CONVERSION_FAILED: "The offscreen converter failed to generate the Postman Collection.",
  CONVERTER_RUNTIME_INCOMPATIBLE: "The converter is incompatible with this browser runtime."
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly technicalDetails?: string;

  constructor(code: ErrorCode, technicalDetails?: string) {
    super(ERROR_MESSAGES[code]);
    this.name = "AppError";
    this.code = code;
    this.technicalDetails = technicalDetails;
  }

  toJSON(): { code: ErrorCode; message: string; technicalDetails?: string } {
    return { code: this.code, message: this.message, technicalDetails: this.technicalDetails };
  }
}

export function messageFor(code: ErrorCode): string {
  return ERROR_MESSAGES[code];
}

export function toAppError(error: unknown, fallbackCode: ErrorCode = "CONVERSION_FAILED"): AppError {
  if (error instanceof AppError) return error;
  const details = error instanceof Error ? error.message : String(error);
  return new AppError(fallbackCode, details);
}
