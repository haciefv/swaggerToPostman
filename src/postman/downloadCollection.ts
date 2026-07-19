import { AppError } from "../shared/errors";

function toBase64Utf8(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function downloadPostmanCollection(
  collection: Record<string, unknown>,
  filenameBase: string,
  saveAs: boolean
): Promise<number> {
  const json = JSON.stringify(collection, null, 2);
  const filename = `${filenameBase}-postman-collection.json`;
  const dataUrl = `data:application/json;base64,${toBase64Utf8(json)}`;

  try {
    return await chrome.downloads.download({ url: dataUrl, filename, saveAs });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new AppError("DOWNLOAD_FAILED", details);
  }
}
