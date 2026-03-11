export type MatchConfig =
  | {
      type: "webflow_id";
      csvColumn: string;
    }
  | {
      type: "field";
      csvColumn: string;
      fieldSlug: string;
    };

export type CollectionConfig = {
  collectionId: string;
  match: MatchConfig;
  fieldMap: Record<string, string>;
  references?: Record<
    string,
    {
      collectionId: string;
      lookupField: string;
      csvSeparator?: string;
    }
  >;
};

export type CollectionsConfig = Record<string, CollectionConfig>;

export type GoogleSheetsTabsConfig = {
  spreadsheetId: string;
  tabs: Record<
    string,
    {
      gid: string;
      title?: string;
    }
  >;
};

export type CsvRow = Record<string, string>;

export type SyncMode = "live" | "staged";

export type SyncRequest = {
  collectionKey: string;
  csvText?: string;
  csvUrl?: string;
  useSheetTab?: boolean;
  mode: SyncMode;
  dryRun?: boolean;
};

export type TriggerSyncRequest = {
  collectionKey?: string;
  collectionKeys?: string[];
  mode?: SyncMode;
  dryRun?: boolean;
};

export type SyncOperation = {
  action: "create" | "update";
  matchValue: string;
  fieldData: Record<string, unknown>;
  isArchived?: boolean;
  isDraft?: boolean;
  id?: string;
};

export type SyncResult = {
  collectionKey: string;
  collectionId: string;
  rowCount: number;
  createCount: number;
  updateCount: number;
  mode: SyncMode;
  dryRun: boolean;
  errors: string[];
};
