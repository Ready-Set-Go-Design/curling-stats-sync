import { CollectionConfig, CsvRow, SyncMode, SyncOperation, SyncResult } from './types';

const API_BASE = 'https://api.webflow.com/v2';
const CHUNK_SIZE = 100;

type WebflowItem = {
    id: string;
    fieldData: Record<string, unknown>;
};

type WebflowCollectionField = {
    slug: string;
    displayName: string;
    type: string;
    validations?: {
        options?: Array<{
            name: string;
            id: string;
        }>;
    };
};

type WebflowCollection = {
    id: string;
    displayName: string;
    fields: WebflowCollectionField[];
};

type WebflowListResponse = {
    items: WebflowItem[];
    pagination?: {
        offset: number;
        limit: number;
        total: number;
    };
};

type ReferenceIndexes = Record<string, Map<string, string>>;

function chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];

    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }

    return chunks;
}

function normalizeScalar(value: string): unknown {
    const trimmed = value.trim();

    if (!trimmed) {
        return undefined;
    }

    const lower = trimmed.toLowerCase();

    if (['true', 'yes', 'y'].includes(lower)) {
        return true;
    }

    if (['false', 'no', 'n'].includes(lower)) {
        return false;
    }

    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        return Number(trimmed);
    }

    if (trimmed.includes('|')) {
        return trimmed
            .split('|')
            .map((entry) => entry.trim())
            .filter(Boolean);
    }

    return trimmed;
}

function normalizeLookupValue(value: unknown): string | null {
    if (typeof value === 'string') {
        const normalized = value.trim();
        return normalized ? normalized : null;
    }

    if (typeof value === 'number') {
        return String(value);
    }

    return null;
}

function normalizeBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'string') {
        const lower = value.trim().toLowerCase();

        if (['true', 'yes', 'y'].includes(lower)) {
            return true;
        }

        if (['false', 'no', 'n'].includes(lower)) {
            return false;
        }
    }

    return undefined;
}

function normalizeDateTime(value: string): string | undefined {
    const trimmed = value.trim();

    if (!trimmed) {
        return undefined;
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
        return undefined;
    }

    return parsed.toISOString();
}

function getOptionId(field: WebflowCollectionField, rawValue: string): string | undefined {
    const trimmed = rawValue.trim();

    if (!trimmed) {
        return undefined;
    }

    const options = field.validations?.options ?? [];
    const directId = options.find((option) => option.id === trimmed);
    if (directId) {
        return directId.id;
    }

    const normalized = trimmed.toLowerCase();
    const byName = options.find((option) => option.name.toLowerCase() === normalized);
    return byName?.id;
}

function buildFieldData(
    row: CsvRow,
    config: CollectionConfig,
    referenceIndexes: ReferenceIndexes,
    schemaFieldsBySlug: Map<string, WebflowCollectionField>
): {
    fieldData: Record<string, unknown>;
    isArchived?: boolean;
    isDraft?: boolean;
    errors: string[];
} {
    const fieldData: Record<string, unknown> = {};
    const errors: string[] = [];
    let isArchived: boolean | undefined;
    let isDraft: boolean | undefined;

    for (const [csvColumn, fieldSlug] of Object.entries(config.fieldMap)) {
        const rawValue = row[csvColumn];
        const referenceConfig = config.references?.[csvColumn];

        if (referenceConfig) {
            const lookupIndex = referenceIndexes[csvColumn];
            const separator = referenceConfig.csvSeparator ?? '|';
            const parts = (rawValue ?? '')
                .split(separator)
                .map((entry) => entry.trim())
                .filter(Boolean);

            if (parts.length === 0) {
                continue;
            }

            const resolvedIds = parts.map((part) => {
                const resolved = lookupIndex?.get(part);

                if (!resolved) {
                    errors.push(`Unable to resolve reference "${part}" for column "${csvColumn}"`);
                }

                return resolved;
            });

            if (errors.length > 0) {
                continue;
            }

            fieldData[fieldSlug] = resolvedIds.length === 1 ? resolvedIds[0] : resolvedIds.filter(Boolean);
            continue;
        }

        if (fieldSlug === 'is-archived') {
            isArchived = normalizeBoolean(normalizeScalar(rawValue ?? ''));
            continue;
        }

        if (fieldSlug === 'is-draft') {
            isDraft = normalizeBoolean(normalizeScalar(rawValue ?? ''));
            continue;
        }

        const schemaField = schemaFieldsBySlug.get(fieldSlug);

        if (schemaField?.type === 'Option') {
            const optionId = getOptionId(schemaField, rawValue ?? '');

            if ((rawValue ?? '').trim() && !optionId) {
                errors.push(`Unable to resolve option "${rawValue}" for column "${csvColumn}"`);
                continue;
            }

            if (optionId) {
                fieldData[fieldSlug] = optionId;
            }

            continue;
        }

        if (schemaField?.type === 'DateTime') {
            const isoValue = normalizeDateTime(rawValue ?? '');

            if ((rawValue ?? '').trim() && !isoValue) {
                errors.push(`Unable to parse date "${rawValue}" for column "${csvColumn}"`);
                continue;
            }

            if (isoValue) {
                fieldData[fieldSlug] = isoValue;
            }

            continue;
        }

        const value = normalizeScalar(rawValue ?? '');

        if (value !== undefined) {
            fieldData[fieldSlug] = value;
        }
    }

    return { fieldData, isArchived, isDraft, errors };
}

function getMatchValue(row: CsvRow, config: CollectionConfig): string {
    return (row[config.match.csvColumn] ?? '').trim();
}

function isLiveResourceNotFoundError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }

    return error.message.includes('Webflow API 404:') && error.message.includes('"code":"resource_not_found"');
}

async function webflowFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(init?.headers ?? {})
        }
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Webflow API ${response.status}: ${body}`);
    }

    return (await response.json()) as T;
}

async function listAllItems(token: string, collectionId: string): Promise<WebflowItem[]> {
    const items: WebflowItem[] = [];
    let offset = 0;

    while (true) {
        const response = await webflowFetch<WebflowListResponse>(
            token,
            `/collections/${collectionId}/items?offset=${offset}&limit=100`,
            { method: 'GET' }
        );

        items.push(...(response.items ?? []));

        const pagination = response.pagination;
        if (!pagination) {
            break;
        }

        offset += pagination.limit;
        if (offset >= pagination.total) {
            break;
        }
    }

    return items;
}

async function getCollection(token: string, collectionId: string): Promise<WebflowCollection> {
    return webflowFetch<WebflowCollection>(token, `/collections/${collectionId}`, {
        method: 'GET'
    });
}

async function buildReferenceIndexes(token: string, config: CollectionConfig): Promise<ReferenceIndexes> {
    const indexes: ReferenceIndexes = {};

    for (const [csvColumn, referenceConfig] of Object.entries(config.references ?? {})) {
        const items = await listAllItems(token, referenceConfig.collectionId);
        indexes[csvColumn] = new Map(
            items
                .map((item) => {
                    const lookupValue = normalizeLookupValue(item.fieldData[referenceConfig.lookupField]);
                    return lookupValue ? ([lookupValue, item.id] as const) : null;
                })
                .filter((entry): entry is readonly [string, string] => entry !== null)
        );
    }

    return indexes;
}

async function createItems(
    token: string,
    collectionId: string,
    mode: SyncMode,
    items: Array<{ fieldData: Record<string, unknown> }>
): Promise<void> {
    if (items.length === 0) {
        return;
    }

    const path = mode === 'live' ? `/collections/${collectionId}/items/live` : `/collections/${collectionId}/items`;

    for (const group of chunk(items, CHUNK_SIZE)) {
        await webflowFetch(token, path, {
            method: 'POST',
            body: JSON.stringify({ items: group })
        });
    }
}

async function updateItems(
    token: string,
    collectionId: string,
    mode: SyncMode,
    items: Array<{ id: string; fieldData: Record<string, unknown> }>
): Promise<void> {
    if (items.length === 0) {
        return;
    }

    if (mode === 'live') {
        for (const item of items) {
            try {
                await webflowFetch(token, `/collections/${collectionId}/items/live`, {
                    method: 'PATCH',
                    body: JSON.stringify({ items: [item] })
                });
            } catch (error) {
                if (!isLiveResourceNotFoundError(error)) {
                    throw error;
                }

                await webflowFetch(token, `/collections/${collectionId}/items`, {
                    method: 'PATCH',
                    body: JSON.stringify({ items: [item] })
                });
            }
        }

        return;
    }

    for (const group of chunk(items, CHUNK_SIZE)) {
        await webflowFetch(token, `/collections/${collectionId}/items`, {
            method: 'PATCH',
            body: JSON.stringify({ items: group })
        });
    }
}

function planOperations(
    rows: CsvRow[],
    config: CollectionConfig,
    existingItems: WebflowItem[],
    referenceIndexes: ReferenceIndexes,
    schemaFieldsBySlug: Map<string, WebflowCollectionField>
): { operations: SyncOperation[]; errors: string[] } {
    const errors: string[] = [];
    const operations: SyncOperation[] = [];

    const itemById = new Map(existingItems.map((item) => [item.id, item]));
    const itemByField =
        config.match.type === 'field'
            ? new Map(
                  existingItems
                      .map((item) => {
                          const value = item.fieldData[config.match.type === 'field' ? config.match.fieldSlug : ''];
                          return typeof value === 'string' || typeof value === 'number'
                              ? ([String(value), item] as const)
                              : null;
                      })
                      .filter((entry): entry is readonly [string, WebflowItem] => entry !== null)
              )
            : new Map<string, WebflowItem>();

    rows.forEach((row, index) => {
        const built = buildFieldData(row, config, referenceIndexes, schemaFieldsBySlug);
        const matchValue = getMatchValue(row, config);

        if (built.errors.length > 0) {
            built.errors.forEach((error) => {
                errors.push(`Row ${index + 2}: ${error}`);
            });
            return;
        }

        const fieldData = built.fieldData;

        if (!('name' in fieldData) || !('slug' in fieldData)) {
            errors.push(`Row ${index + 2}: missing mapped name or slug value`);
            return;
        }

        if (config.match.type === 'webflow_id') {
            if (matchValue && itemById.has(matchValue)) {
                operations.push({
                    action: 'update',
                    id: matchValue,
                    matchValue,
                    fieldData,
                    isArchived: built.isArchived,
                    isDraft: built.isDraft
                });
                return;
            }

            operations.push({
                action: 'create',
                matchValue,
                fieldData,
                isArchived: built.isArchived,
                isDraft: built.isDraft
            });
            return;
        }

        if (!matchValue) {
            errors.push(`Row ${index + 2}: missing match value for ${config.match.csvColumn}`);
            return;
        }

        const existing = itemByField.get(matchValue);
        if (existing) {
            operations.push({
                action: 'update',
                id: existing.id,
                matchValue,
                fieldData,
                isArchived: built.isArchived,
                isDraft: built.isDraft
            });
            return;
        }

        operations.push({
            action: 'create',
            matchValue,
            fieldData,
            isArchived: built.isArchived,
            isDraft: built.isDraft
        });
    });

    return { operations, errors };
}

export async function syncCollection(params: {
    token: string;
    config: CollectionConfig;
    rows: CsvRow[];
    mode: SyncMode;
    dryRun: boolean;
    collectionKey: string;
}): Promise<SyncResult> {
    const { token, config, rows, mode, dryRun, collectionKey } = params;

    const existingItems =
        config.match.type === 'field' || config.match.type === 'webflow_id'
            ? await listAllItems(token, config.collectionId)
            : [];
    const collection = await getCollection(token, config.collectionId);
    const referenceIndexes = await buildReferenceIndexes(token, config);
    const schemaFieldsBySlug = new Map(collection.fields.map((field) => [field.slug, field]));
    const { operations, errors } = planOperations(rows, config, existingItems, referenceIndexes, schemaFieldsBySlug);

    const creates = operations
        .filter((operation) => operation.action === 'create')
        .map((operation) => ({
            fieldData: operation.fieldData,
            isArchived: operation.isArchived,
            isDraft: operation.isDraft
        }));

    const updates = operations
        .filter(
            (operation): operation is SyncOperation & { id: string } =>
                operation.action === 'update' && Boolean(operation.id)
        )
        .map((operation) => ({
            id: operation.id,
            fieldData: operation.fieldData,
            isArchived: operation.isArchived,
            isDraft: operation.isDraft
        }));

    if (!dryRun) {
        await createItems(token, config.collectionId, mode, creates);
        await updateItems(token, config.collectionId, mode, updates);
    }

    return {
        collectionKey,
        collectionId: config.collectionId,
        rowCount: rows.length,
        createCount: creates.length,
        updateCount: updates.length,
        mode,
        dryRun,
        errors
    };
}
