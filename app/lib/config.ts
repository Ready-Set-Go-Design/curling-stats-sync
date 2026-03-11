import { CollectionsConfig, GoogleSheetsTabsConfig } from "@/lib/types";

export function getCollectionsConfig(): CollectionsConfig {
  const raw = process.env.WEBFLOW_COLLECTIONS_JSON;

  if (!raw) {
    throw new Error("Missing WEBFLOW_COLLECTIONS_JSON");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("WEBFLOW_COLLECTIONS_JSON is not valid JSON");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("WEBFLOW_COLLECTIONS_JSON must be a JSON object");
  }

  return parsed as CollectionsConfig;
}

export function getWebflowToken(): string {
  const token = process.env.WEBFLOW_API_TOKEN;

  if (!token) {
    throw new Error("Missing WEBFLOW_API_TOKEN");
  }

  return token;
}

export function getGoogleSheetsTabsConfig(): GoogleSheetsTabsConfig | null {
  const raw = process.env.GOOGLE_SHEETS_TABS_JSON;

  if (!raw) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SHEETS_TABS_JSON is not valid JSON");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("GOOGLE_SHEETS_TABS_JSON must be a JSON object");
  }

  return parsed as GoogleSheetsTabsConfig;
}

export function buildGoogleSheetsCsvUrl(
  config: GoogleSheetsTabsConfig,
  collectionKey: string
): string {
  const tab = config.tabs[collectionKey];

  if (!tab?.gid) {
    throw new Error(`Missing Google Sheets tab config for collection: ${collectionKey}`);
  }

  return `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/export?format=csv&gid=${tab.gid}`;
}

export function getSyncSharedSecret(): string | null {
  return process.env.SYNC_SHARED_SECRET ?? null;
}
