import { AppError } from "../shared/errors";
import { ALLOWED_URL_PROTOCOLS, FETCH_TIMEOUT_MS } from "../shared/constants";

export function assertSafeSpecUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new AppError("SPEC_FETCH_FAILED", `Invalid URL: ${rawUrl}`);
  }
  if (!ALLOWED_URL_PROTOCOLS.includes(parsed.protocol as (typeof ALLOWED_URL_PROTOCOLS)[number])) {
    throw new AppError("SPEC_FETCH_FAILED", `Unsupported protocol: ${parsed.protocol}`);
  }
  return parsed;
}

/**
 * Fetches a specification URL using the current browser session (credentials: "include").
 * Only ever called with URLs that have already been validated against the
 * activeTab origin or an approved optional_host_permissions grant.
 */
export async function fetchSpecificationText(rawUrl: string): Promise<string> {
  const url = assertSafeSpecUrl(rawUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      credentials: "include",
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "application/json, text/yaml, application/yaml, text/plain, */*" }
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppError("SPEC_FETCH_FAILED", "Request timed out");
    }
    const details = error instanceof Error ? error.message : String(error);
    throw new AppError("SPEC_FETCH_FAILED", `Network error or CORS: ${details}`);
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 401) throw new AppError("SPEC_UNAUTHORIZED");
  if (response.status === 403) throw new AppError("SPEC_FORBIDDEN");
  if (response.status === 404) throw new AppError("SPEC_FETCH_FAILED", "404 Not Found");
  if (!response.ok) throw new AppError("SPEC_FETCH_FAILED", `HTTP ${response.status}`);

  const text = await response.text();
  if (text.trim().length === 0) {
    throw new AppError("INVALID_SPEC", "Empty response body");
  }
  return text;
}

export function isSameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}
