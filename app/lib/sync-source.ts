import {
  buildGoogleSheetsCsvUrl,
  getCollectionsConfig,
  getGoogleSheetsTabsConfig,
  getWebflowToken
} from "@/lib/config";
import { parseCsv } from "@/lib/csv";
import { SyncMode, SyncResult } from "@/lib/types";
import { syncCollection } from "@/lib/webflow";

async function fetchCsvText(url: string): Promise<string> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "text/csv,text/plain;q=0.9,*/*;q=0.1"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch CSV URL: ${response.status}`);
  }

  return response.text();
}

export async function loadCsvText(params: {
  collectionKey: string;
  csvText?: string;
  csvUrl?: string;
  useSheetTab?: boolean;
}): Promise<string> {
  if (params.csvText?.trim()) {
    return params.csvText;
  }

  if (params.csvUrl?.trim()) {
    return fetchCsvText(params.csvUrl);
  }

  if (params.useSheetTab) {
    const sheetsConfig = getGoogleSheetsTabsConfig();

    if (!sheetsConfig) {
      throw new Error("Missing GOOGLE_SHEETS_TABS_JSON");
    }

    return fetchCsvText(buildGoogleSheetsCsvUrl(sheetsConfig, params.collectionKey));
  }

  throw new Error("Provide csvText, csvUrl, or useSheetTab");
}

export async function runCollectionSync(params: {
  collectionKey: string;
  csvText?: string;
  csvUrl?: string;
  useSheetTab?: boolean;
  mode: SyncMode;
  dryRun: boolean;
}): Promise<SyncResult> {
  const collections = getCollectionsConfig();
  const config = collections[params.collectionKey];

  if (!config) {
    throw new Error(`Unknown collection key: ${params.collectionKey}`);
  }

  const csvText = await loadCsvText(params);
  const rows = parseCsv(csvText);

  if (rows.length === 0) {
    throw new Error("No data rows found in CSV");
  }

  const token = getWebflowToken();

  return syncCollection({
    token,
    config,
    rows,
    mode: params.mode,
    dryRun: params.dryRun,
    collectionKey: params.collectionKey
  });
}
