import {
    getCollectionsConfig,
    getGoogleSheetsApiKey,
    getGoogleServiceAccountConfig,
    getGoogleSheetsTabConfig,
    getGoogleSheetsTabsConfig,
    getWebflowToken
} from './config';
import { parseCsv } from './csv';
import { CsvRow, SyncMode, SyncResult } from './types';
import { syncCollection } from './webflow';
import { createSign } from 'node:crypto';

type GoogleSheetsMetadataResponse = {
    sheets?: Array<{
        properties?: {
            sheetId?: number;
            title?: string;
        };
    }>;
};

type GoogleSheetsValuesResponse = {
    values?: Array<Array<string | number | boolean | null>>;
};

type GoogleOAuthTokenResponse = {
    access_token: string;
    expires_in: number;
    token_type: string;
};

let cachedGoogleAccessToken:
    | {
          token: string;
          expiresAt: number;
      }
    | undefined;

function toCellString(value: string | number | boolean | null | undefined): string {
    if (value === null || value === undefined) {
        return '';
    }

    return String(value).trim();
}

async function fetchCsvText(url: string): Promise<string> {
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            Accept: 'text/csv,text/plain;q=0.9,*/*;q=0.1'
        },
        cache: 'no-store'
    });

    if (!response.ok) {
        throw new Error(`Unable to fetch CSV URL: ${response.status}`);
    }

    return response.text();
}

function encodeBase64Url(value: string): string {
    return Buffer.from(value)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function createGoogleServiceAccountAssertion(): string {
    const serviceAccount = getGoogleServiceAccountConfig();

    if (!serviceAccount) {
        throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_JSON');
    }

    const now = Math.floor(Date.now() / 1000);
    const header = {
        alg: 'RS256',
        typ: 'JWT'
    };
    const payload = {
        iss: serviceAccount.client_email,
        scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
        aud: serviceAccount.token_uri ?? 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
    };
    const encodedHeader = encodeBase64Url(JSON.stringify(header));
    const encodedPayload = encodeBase64Url(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signer = createSign('RSA-SHA256');

    signer.update(signingInput);
    signer.end();

    const signature = signer
        .sign(serviceAccount.private_key, 'base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');

    return `${signingInput}.${signature}`;
}

async function getGoogleAccessToken(): Promise<string> {
    if (cachedGoogleAccessToken && cachedGoogleAccessToken.expiresAt > Date.now() + 60_000) {
        return cachedGoogleAccessToken.token;
    }

    const serviceAccount = getGoogleServiceAccountConfig();

    if (!serviceAccount) {
        throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_JSON');
    }

    const response = await fetch(serviceAccount.token_uri ?? 'https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: createGoogleServiceAccountAssertion()
        }),
        cache: 'no-store'
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Google OAuth ${response.status}: ${body}`);
    }

    const tokenResponse = (await response.json()) as GoogleOAuthTokenResponse;

    cachedGoogleAccessToken = {
        token: tokenResponse.access_token,
        expiresAt: Date.now() + tokenResponse.expires_in * 1000
    };

    return tokenResponse.access_token;
}

async function googleSheetsFetch<T>(path: string): Promise<T> {
    const separator = path.includes('?') ? '&' : '?';
    const serviceAccount = getGoogleServiceAccountConfig();
    const apiKey = serviceAccount ? null : getGoogleSheetsApiKey();
    const url = apiKey
        ? `https://sheets.googleapis.com/v4${path}${separator}key=${encodeURIComponent(apiKey)}`
        : `https://sheets.googleapis.com/v4${path}`;
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
            ...(serviceAccount
                ? {
                      Authorization: `Bearer ${await getGoogleAccessToken()}`
                  }
                : {})
        },
        cache: 'no-store'
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Google Sheets API ${response.status}: ${body}`);
    }

    return (await response.json()) as T;
}

function buildSheetRange(title: string): string {
    if (/^[A-Za-z0-9_]+$/.test(title)) {
        return title;
    }

    return `'${title.replace(/'/g, "''")}'`;
}

async function resolveSheetTitle(collectionKey: string): Promise<{ spreadsheetId: string; title: string }> {
    const sheetsConfig = getGoogleSheetsTabsConfig();

    if (!sheetsConfig) {
        throw new Error('Missing GOOGLE_SHEETS_TABS_JSON');
    }

    const tab = getGoogleSheetsTabConfig(sheetsConfig, collectionKey);

    if (tab.title?.trim()) {
        return {
            spreadsheetId: sheetsConfig.spreadsheetId,
            title: tab.title.trim()
        };
    }

    const metadata = await googleSheetsFetch<GoogleSheetsMetadataResponse>(
        `/spreadsheets/${encodeURIComponent(sheetsConfig.spreadsheetId)}?fields=sheets(properties(sheetId,title))`
    );

    const matchedSheet = metadata.sheets?.find((sheet) => String(sheet.properties?.sheetId ?? '') === tab.gid);
    const title = matchedSheet?.properties?.title?.trim();

    if (!title) {
        throw new Error(`Unable to resolve Google Sheets title for collection: ${collectionKey}`);
    }

    return {
        spreadsheetId: sheetsConfig.spreadsheetId,
        title
    };
}

async function loadRowsFromSheetTab(collectionKey: string): Promise<CsvRow[]> {
    const { spreadsheetId, title } = await resolveSheetTitle(collectionKey);
    const range = buildSheetRange(title);
    const response = await googleSheetsFetch<GoogleSheetsValuesResponse>(
        `/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`
    );

    const [headerRow = [], ...dataRows] = response.values ?? [];
    const headers = headerRow.map((value) => toCellString(value));

    if (headers.length === 0 || headers.every((header) => !header)) {
        return [];
    }

    return dataRows
        .map((row) =>
            headers.reduce<CsvRow>((mapped, header, headerIndex) => {
                mapped[header] = toCellString(row[headerIndex]);
                return mapped;
            }, {})
        )
        .filter((row) => Object.values(row).some((value) => value !== ''));
}

export async function loadRows(params: {
    collectionKey: string;
    csvText?: string;
    csvUrl?: string;
    useSheetTab?: boolean;
}): Promise<CsvRow[]> {
    if (params.csvText?.trim()) {
        return parseCsv(params.csvText);
    }

    if (params.csvUrl?.trim()) {
        return parseCsv(await fetchCsvText(params.csvUrl));
    }

    if (params.useSheetTab) {
        return loadRowsFromSheetTab(params.collectionKey);
    }

    throw new Error('Provide csvText, csvUrl, or useSheetTab');
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

    const rows = await loadRows(params);

    if (rows.length === 0) {
        throw new Error('No data rows found in sync source');
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
