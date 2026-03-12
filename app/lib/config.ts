import { CollectionsConfig, GoogleSheetsTabsConfig } from './types';

type GoogleServiceAccountConfig = {
    client_email: string;
    private_key: string;
    token_uri?: string;
};

export function getCollectionsConfig(): CollectionsConfig {
    const raw = process.env.WEBFLOW_COLLECTIONS_JSON;

    if (!raw) {
        throw new Error('Missing WEBFLOW_COLLECTIONS_JSON');
    }

    let parsed: unknown;

    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error('WEBFLOW_COLLECTIONS_JSON is not valid JSON');
    }

    if (!parsed || typeof parsed !== 'object') {
        throw new Error('WEBFLOW_COLLECTIONS_JSON must be a JSON object');
    }

    return parsed as CollectionsConfig;
}

export function getWebflowToken(): string {
    const token = process.env.WEBFLOW_API_TOKEN;

    if (!token) {
        throw new Error('Missing WEBFLOW_API_TOKEN');
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
        throw new Error('GOOGLE_SHEETS_TABS_JSON is not valid JSON');
    }

    if (!parsed || typeof parsed !== 'object') {
        throw new Error('GOOGLE_SHEETS_TABS_JSON must be a JSON object');
    }

    return parsed as GoogleSheetsTabsConfig;
}

export function getGoogleSheetsApiKey(): string {
    const apiKey = process.env.GOOGLE_SHEETS_API_KEY;

    if (!apiKey) {
        throw new Error('Missing GOOGLE_SHEETS_API_KEY');
    }

    return apiKey;
}

export function getGoogleServiceAccountConfig(): GoogleServiceAccountConfig | null {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

    if (!raw) {
        return null;
    }

    let parsed: unknown;

    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
    }

    if (!parsed || typeof parsed !== 'object') {
        throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON must be a JSON object');
    }

    const config = parsed as GoogleServiceAccountConfig;

    if (!config.client_email || !config.private_key) {
        throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON must include client_email and private_key');
    }

    return {
        ...config,
        private_key: config.private_key.replace(/\\n/g, '\n')
    };
}

export function getGoogleSheetsTabConfig(
    config: GoogleSheetsTabsConfig,
    collectionKey: string
): { gid: string; title?: string } {
    const tab = config.tabs[collectionKey];

    if (!tab?.gid) {
        throw new Error(`Missing Google Sheets tab config for collection: ${collectionKey}`);
    }

    return tab;
}

export function getSyncSharedSecret(): string | null {
    return process.env.SYNC_SHARED_SECRET ?? null;
}
