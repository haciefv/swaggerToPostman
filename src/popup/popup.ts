import { sendMessage } from "../shared/messages";
import { DEFAULT_CONVERSION_SETTINGS } from "../shared/types";
import type {
  ConversionSettings,
  DetectedSpecification,
  DetectionResult,
  FolderStrategy,
  ParametersResolution,
  PopupState,
  SpecificationCandidate,
  SpecificationMetadata
} from "../shared/types";
import { t } from "../i18n";

window.addEventListener("error", (event) => {
  console.error("[Swagger to Postman] Uncaught error:", event.error ?? event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("[Swagger to Postman] Unhandled promise rejection:", event.reason);
});

function renderFatalStartupError(message: string): void {
  const box = document.createElement("div");
  box.style.padding = "16px";
  box.style.fontFamily = "sans-serif";
  box.style.fontSize = "13px";
  box.style.color = "#c0392b";
  box.textContent = message;
  document.body.appendChild(box);
}

function resolveContentElement(): HTMLElement | null {
  const node = document.getElementById("content");
  if (!(node instanceof HTMLElement)) {
    console.error("[Swagger to Postman] #content element not found — popup.html may be corrupted.");
    renderFatalStartupError(t.popup.contentMissing);
    return null;
  }
  return node;
}

const content = resolveContentElement();

let state: PopupState = { kind: "loading" };
let settings: ConversionSettings = DEFAULT_CONVERSION_SETTINGS;
let activeTabId: number | null = null;

function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showToast(message: string): void {
  const toast = el("div", "toast", message);
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

function toDetectionState(result: DetectionResult): PopupState {
  if (result.status === "detected") {
    return { kind: "detected", detected: result.detected, metadata: result.metadata, alternatives: result.alternatives };
  }
  if (result.status === "error") {
    return { kind: "error", code: result.code, message: result.message, technicalDetails: result.technicalDetails };
  }
  return { kind: "not-found" };
}

async function runDetection(): Promise<void> {
  state = { kind: "loading" };
  render();

  try {
    const tab = await getActiveTab();
    if (!tab || tab.id === undefined) {
      state = { kind: "not-found" };
      render();
      return;
    }
    activeTabId = tab.id;

    const response = await sendMessage("service-worker", "DETECT_SPEC", { tabId: tab.id });
    if (response.ok) {
      state = toDetectionState(response.data as DetectionResult);
    } else {
      state = {
        kind: "error",
        code: response.error?.code ?? "SWAGGER_NOT_FOUND",
        message: response.error?.message ?? t.popup.unknownError,
        technicalDetails: response.error?.technicalDetails
      };
    }
  } catch (error) {
    console.error("[Swagger to Postman] Detection:", error);
    state = {
      kind: "error",
      code: "SWAGGER_NOT_FOUND",
      message: t.popup.unexpectedDetectionError,
      technicalDetails: error instanceof Error ? error.message : String(error)
    };
  }
  render();
}

async function loadSettings(): Promise<void> {
  try {
    const response = await sendMessage("service-worker", "GET_SETTINGS", {});
    if (response.ok) settings = response.data as ConversionSettings;
  } catch (error) {
    // Non-fatal: fall back to DEFAULT_CONVERSION_SETTINGS and let detection proceed.
    console.error("[Swagger to Postman] Settings:", error);
  }
}

async function saveSettings(): Promise<void> {
  await sendMessage("service-worker", "SAVE_SETTINGS", { settings });
}

function renderLoading(container: HTMLElement): void {
  const wrap = el("div", "state-loading");
  wrap.appendChild(el("div", "spinner"));
  wrap.appendChild(el("span", undefined, t.popup.detectingSpec));
  container.appendChild(wrap);
}

function renderMetaRow(label: string, value: string): HTMLElement {
  const row = el("div", "meta-row");
  row.appendChild(el("span", "meta-row__label", label));
  row.appendChild(el("span", "meta-row__value", value));
  return row;
}

function renderDetected(
  container: HTMLElement,
  detected: DetectedSpecification,
  metadata: SpecificationMetadata,
  alternatives: SpecificationCandidate[]
): void {
  const card = el("div", "card");
  card.appendChild(renderMetaRow(t.metadata.apiName, metadata.title));
  card.appendChild(renderMetaRow(t.metadata.apiVersion, metadata.apiVersion ?? "—"));
  card.appendChild(renderMetaRow(t.metadata.specVersion, metadata.specificationVersion));
  card.appendChild(renderMetaRow(t.metadata.endpointCount, String(metadata.endpointCount)));
  card.appendChild(renderMetaRow(t.metadata.tagCount, String(metadata.tagCount)));
  card.appendChild(renderMetaRow(t.metadata.specUrl, metadata.specUrl ?? detected.url ?? "—"));
  card.appendChild(renderMetaRow(t.metadata.serverUrl, metadata.servers[0] ?? "—"));
  container.appendChild(card);

  if (alternatives.length > 1) {
    const field = el("div", "field");
    field.appendChild(el("label", undefined, t.actions.selectApi));
    const select = el("select");
    for (const candidate of alternatives) {
      const option = el("option", undefined, candidate.name);
      option.value = candidate.url;
      if (candidate.url === detected.url) option.selected = true;
      select.appendChild(option);
    }
    select.addEventListener("change", () => onSelectAlternative(select.value));
    field.appendChild(select);
    container.appendChild(field);
  }

  const buttonRow = el("div", "button-row");

  const convertBtn = el("button", "btn-primary", t.actions.generateCollection);
  convertBtn.addEventListener("click", () => onConvertClick(convertBtn));
  buttonRow.appendChild(convertBtn);

  const downloadRawBtn = el("button", "btn-secondary", t.actions.downloadOpenApi);
  downloadRawBtn.addEventListener("click", () => onDownloadRawClick(detected, metadata));
  buttonRow.appendChild(downloadRawBtn);

  const copyBtn = el("button", "btn-secondary", t.actions.copySpecUrl);
  copyBtn.addEventListener("click", () => onCopySpecUrl(metadata.specUrl ?? detected.url));
  buttonRow.appendChild(copyBtn);

  const retryBtn = el("button", "btn-secondary", t.actions.retry);
  retryBtn.addEventListener("click", () => void runDetection());
  buttonRow.appendChild(retryBtn);

  container.appendChild(buttonRow);
  container.appendChild(renderSettingsPanel());
}

function renderNotFound(container: HTMLElement): void {
  const empty = el("div", "empty-state");
  empty.appendChild(el("span", "empty-state__icon", "🔍"));
  empty.appendChild(el("p", undefined, t.popup.notFound));
  container.appendChild(empty);

  const field = el("div", "field");
  field.appendChild(el("label", undefined, t.actions.openApiUrl));
  const input = el("input", undefined) as HTMLInputElement;
  input.type = "url";
  input.placeholder = t.actions.openApiUrlPlaceholder;
  field.appendChild(input);
  container.appendChild(field);

  const loadBtn = el("button", "btn-primary", t.actions.loadFromUrl);
  loadBtn.addEventListener("click", () => onManualUrlLoad(input.value, loadBtn));
  container.appendChild(loadBtn);

  const retryBtn = el("button", "btn-secondary", t.actions.retry);
  retryBtn.addEventListener("click", () => void runDetection());
  container.appendChild(retryBtn);
}

function renderConverting(container: HTMLElement): void {
  const wrap = el("div", "state-loading");
  wrap.appendChild(el("div", "spinner"));
  wrap.appendChild(el("span", undefined, t.popup.convertingSpec));
  container.appendChild(wrap);
}

function renderError(container: HTMLElement, code: string, message: string, technicalDetails?: string): void {
  const box = el("div", "error-box");
  box.appendChild(el("div", undefined, message));
  if (technicalDetails) {
    const details = el("details", "error-box__details");
    details.appendChild(el("summary", undefined, t.errorBox.technicalDetails));
    const pre = el("pre", undefined, `${code}: ${technicalDetails}`);
    details.appendChild(pre);
    box.appendChild(details);
  }
  container.appendChild(box);

  const retryBtn = el("button", "btn-secondary", t.actions.retry);
  retryBtn.addEventListener("click", () => void runDetection());
  container.appendChild(retryBtn);
}

function renderSettingsPanel(): HTMLElement {
  const details = el("details", "settings");
  const summary = el("summary", undefined, t.settings.title);
  details.appendChild(summary);

  const folderField = el("div", "field");
  folderField.appendChild(el("label", undefined, t.settings.folderStructure));
  const folderSelect = el("select");
  const folderOptions: Array<[FolderStrategy, string]> = [
    ["Tags", t.settings.folderStrategyTags],
    ["Paths", t.settings.folderStrategyPaths]
  ];
  for (const [value, label] of folderOptions) {
    const option = el("option", undefined, label);
    option.value = value;
    option.selected = settings.folderStrategy === value;
    folderSelect.appendChild(option);
  }
  folderSelect.addEventListener("change", () => {
    settings = { ...settings, folderStrategy: folderSelect.value as FolderStrategy };
    void saveSettings();
  });
  folderField.appendChild(folderSelect);
  details.appendChild(folderField);

  const paramsField = el("div", "field");
  paramsField.appendChild(el("label", undefined, t.settings.parametersSource));
  const paramsSelect = el("select");
  const paramOptions: Array<[ParametersResolution, string]> = [
    ["Example", "Example"],
    ["Schema", "Schema"]
  ];
  for (const [value, label] of paramOptions) {
    const option = el("option", undefined, label);
    option.value = value;
    option.selected = settings.parametersResolution === value;
    paramsSelect.appendChild(option);
  }
  paramsSelect.addEventListener("change", () => {
    settings = { ...settings, parametersResolution: paramsSelect.value as ParametersResolution };
    void saveSettings();
  });
  paramsField.appendChild(paramsSelect);
  details.appendChild(paramsField);

  details.appendChild(
    renderCheckbox(t.settings.includeResponses, settings.includeResponses, (checked) => {
      settings = { ...settings, includeResponses: checked };
      void saveSettings();
    })
  );
  details.appendChild(
    renderCheckbox(t.settings.includeDeprecated, settings.includeDeprecated, (checked) => {
      settings = { ...settings, includeDeprecated: checked };
      void saveSettings();
    })
  );
  details.appendChild(
    renderCheckbox(t.settings.askFilenameBeforeDownload, settings.saveAs, (checked) => {
      settings = { ...settings, saveAs: checked };
      void saveSettings();
    })
  );

  return details;
}

function renderCheckbox(label: string, checked: boolean, onChange: (checked: boolean) => void): HTMLElement {
  const row = el("label", "checkbox-row");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  row.appendChild(input);
  row.appendChild(el("span", undefined, label));
  return row;
}

function render(): void {
  if (!content) return;
  clear(content);
  switch (state.kind) {
    case "loading":
      renderLoading(content);
      break;
    case "detected":
      renderDetected(content, state.detected, state.metadata, state.alternatives);
      break;
    case "not-found":
      renderNotFound(content);
      break;
    case "converting":
      renderConverting(content);
      break;
    case "error":
      renderError(content, state.code, state.message, state.technicalDetails);
      break;
  }
}

async function onConvertClick(button: HTMLButtonElement): Promise<void> {
  if (state.kind !== "detected") return;
  button.disabled = true;
  const previousState = state;
  state = { kind: "converting" };
  render();

  const tab = activeTabId !== null ? await chrome.tabs.get(activeTabId).catch(() => null) : null;
  const response = await sendMessage("service-worker", "CONVERT_AND_DOWNLOAD", {
    detected: previousState.detected,
    metadata: previousState.metadata,
    settings,
    pageTitle: tab?.title
  });

  if (response.ok) {
    state = previousState;
    render();
    showToast(t.toasts.collectionDownloaded);
  } else {
    state = {
      kind: "error",
      code: response.error?.code ?? "CONVERSION_FAILED",
      message: response.error?.message ?? t.popup.unknownError,
      technicalDetails: response.error?.technicalDetails
    };
    render();
  }
}

async function onDownloadRawClick(detected: DetectedSpecification, metadata: SpecificationMetadata): Promise<void> {
  const json = JSON.stringify(detected.specification, null, 2);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const dataUrl = `data:application/json;base64,${btoa(binary)}`;
  const filenameBase = metadata.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "api";
  await chrome.downloads.download({ url: dataUrl, filename: `${filenameBase}-openapi.json`, saveAs: settings.saveAs });
  showToast(t.toasts.openApiDownloaded);
}

async function onCopySpecUrl(specUrl: string | undefined): Promise<void> {
  if (!specUrl) {
    showToast(t.toasts.specUrlUnavailable);
    return;
  }
  await navigator.clipboard.writeText(specUrl);
  showToast(t.toasts.specUrlCopied);
}

async function onSelectAlternative(url: string): Promise<void> {
  if (activeTabId === null) return;
  state = { kind: "loading" };
  render();
  const response = await sendMessage("service-worker", "FETCH_SPEC_URL", { url, tabId: activeTabId });
  if (response.ok) {
    state = toDetectionState(response.data as DetectionResult);
  } else {
    state = {
      kind: "error",
      code: response.error?.code ?? "SPEC_FETCH_FAILED",
      message: response.error?.message ?? t.popup.unknownError,
      technicalDetails: response.error?.technicalDetails
    };
  }
  render();
}

async function onManualUrlLoad(url: string, button: HTMLButtonElement): Promise<void> {
  if (!url || activeTabId === null) return;
  button.disabled = true;
  state = { kind: "loading" };
  render();

  const response = await sendMessage("service-worker", "FETCH_SPEC_URL", { url, tabId: activeTabId });
  if (response.ok) {
    state = toDetectionState(response.data as DetectionResult);
  } else if (response.error?.code === "HOST_PERMISSION_DENIED") {
    const origin = new URL(url).origin;
    const permissionResponse = await sendMessage("service-worker", "REQUEST_HOST_PERMISSION", { origin });
    if (permissionResponse.ok) {
      const retry = await sendMessage("service-worker", "FETCH_SPEC_URL", { url, tabId: activeTabId });
      state = retry.ok
        ? toDetectionState(retry.data as DetectionResult)
        : {
            kind: "error",
            code: retry.error?.code ?? "SPEC_FETCH_FAILED",
            message: retry.error?.message ?? t.popup.unknownError,
            technicalDetails: retry.error?.technicalDetails
          };
    } else {
      state = { kind: "error", code: "HOST_PERMISSION_DENIED", message: "Permission to access this host was denied." };
    }
  } else {
    state = {
      kind: "error",
      code: response.error?.code ?? "SPEC_FETCH_FAILED",
      message: response.error?.message ?? t.popup.unknownError,
      technicalDetails: response.error?.technicalDetails
    };
  }
  render();
}

function showStartupError(error: unknown): void {
  console.error("[Swagger to Postman] Startup:", error);
  state = {
    kind: "error",
    code: "SWAGGER_NOT_FOUND",
    message: t.popup.unexpectedStartupError,
    technicalDetails: error instanceof Error ? error.message : String(error)
  };
  render();
}

if (content) {
  // Render the loading state synchronously, before any await, so the popup is
  // never blank while settings/detection messages are in flight (or hung).
  render();

  void loadSettings()
    .catch((error) => console.error("[Swagger to Postman] Settings:", error))
    .finally(() => {
      void runDetection().catch(showStartupError);
    });
}
